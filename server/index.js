import 'dotenv/config'
import express from 'express'
import http from 'http'
import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import crypto from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { fileURLToPath, pathToFileURL } from 'url'
import { Server } from 'socket.io'

const senha = process.env.SENHA
if (!senha) {
  console.error('Defina a variável de ambiente SENHA (veja .env.example).')
  process.exit(1)
}

class Erro extends Error {
  constructor(status, msg) {
    super(msg)
    this.status = status
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(__dirname, '../dist')
const app = express()
const server = http.createServer(app)
const io = new Server(server, { maxHttpBufferSize: 10e6 }) // imagens

let estado = { modo: 'vazio' }
let quadro = { imagens: [], tracos: [] }
let dim = { w: 1024, h: 768 } // tamanho útil da tela de exibição (define a proporção do quadro)
const snap = () => ({ ...quadro, dim })

/* ---------------- slides ---------------- */
let deck = null // { id, nome, total, pagina, buf } — o PDF fica em memória
const meta = () => (deck ? { id: deck.id, nome: deck.nome, total: deck.total, pagina: deck.pagina } : null)
const mandarEstado = (alvo) => alvo.emit('estado', estado.modo === 'slides' && deck ? { ...estado, ...meta() } : estado)
const mandarDeck = (alvo) => alvo.emit('deck', meta())

const execFileP = promisify(execFile)
const SOFFICE = [
  process.env.SOFFICE,
  'soffice',
  'libreoffice',
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
].filter(Boolean)

// PowerPoint -> PDF usando o LibreOffice (precisa estar instalado no servidor)
async function converter(buf, ext) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'icop-'))
  try {
    const entrada = path.join(dir, `apresentacao.${ext}`)
    await fs.writeFile(entrada, buf)
    const args = [
      '--headless', '--norestore',
      `-env:UserInstallation=${pathToFileURL(path.join(dir, 'perfil')).href}`,
      '--convert-to', 'pdf', '--outdir', dir, entrada,
    ]
    for (const bin of SOFFICE) {
      try {
        await execFileP(bin, args, { timeout: 180000 })
      } catch (e) {
        if (e.code === 'ENOENT') continue // não está instalado nesse caminho
        throw new Erro(500, 'Não consegui converter a apresentação. Tente exportar como PDF.')
      }
      try {
        return await fs.readFile(path.join(dir, 'apresentacao.pdf'))
      } catch {
        throw new Erro(500, 'Não consegui converter a apresentação. Tente exportar como PDF.')
      }
    }
    throw new Erro(501, 'Para enviar PowerPoint, instale o LibreOffice (gratuito) no computador do servidor. Ou exporte o arquivo como PDF.')
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

app.post('/api/slides', express.raw({ type: () => true, limit: '120mb' }), async (req, res) => {
  try {
    if (decodeURIComponent(req.get('x-senha') || '') !== senha) throw new Erro(401, 'Senha inválida.')
    const buf = req.body
    if (!Buffer.isBuffer(buf) || !buf.length) throw new Erro(400, 'Arquivo vazio.')
    const nome = decodeURIComponent(req.get('x-nome') || 'apresentacao').slice(0, 120)
    let pdf = buf
    if (buf.subarray(0, 5).toString() !== '%PDF-') {
      const ext = path.extname(nome).slice(1).toLowerCase()
      if (!['ppt', 'pptx', 'pps', 'ppsx', 'odp'].includes(ext)) throw new Erro(400, 'Envie um PDF ou PowerPoint (.pptx, .ppt).')
      pdf = await converter(buf, ext)
    }
    deck = { id: crypto.randomBytes(8).toString('hex'), nome, total: 0, pagina: 1, buf: pdf }
    mandarDeck(io.to('controle'))
    res.json({ id: deck.id })
  } catch (e) {
    res.status(e.status || 500).json({ erro: e.message })
  }
})

app.get('/slides/:arquivo', (req, res) => {
  const id = req.params.arquivo.replace(/\.pdf$/, '')
  if (!deck || id !== deck.id) return res.sendStatus(404)
  res.type('application/pdf').set('Cache-Control', 'private, max-age=3600').send(deck.buf)
})

app.use(express.static(dist))
app.use((_, res) => res.sendFile(path.join(dist, 'index.html')))

io.on('connection', (s) => {
  const so = (fn) => (...a) => { if (s.data.ok) fn(...a) } // só quem tem a senha

  s.on('tela', () => {
    s.join('tela')
    mandarEstado(s)
    s.emit('q:estado', snap())
  })

  s.on('tela-dim', (d) => {
    if (!s.rooms.has('tela') || !(d?.w > 0 && d?.h > 0)) return
    dim = { w: Math.round(d.w), h: Math.round(d.h) }
    io.emit('q:dim', dim)
  })

  s.on('controle', (tentativa, ack) => {
    if (tentativa !== senha) return ack?.(false)
    s.data.ok = true
    s.join('controle')
    ack?.(true)
    mandarEstado(s)
    mandarDeck(s)
    s.emit('q:estado', snap())
  })

  s.on('mostrar', so((novo) => {
    estado = novo?.modo === 'slides' ? { modo: 'slides' } : novo
    mandarEstado(io)
  }))

  s.on('yt', so((cmd) => io.to('tela').emit('yt', cmd)))

  s.on('yt-status', (st) => {
    if (s.rooms.has('tela')) io.to('controle').emit('yt-status', st)
  })

  // ---- slides ----
  s.on('slides:total', so((n) => {
    if (!deck || !Number.isInteger(n) || n < 1) return
    deck.total = n
    deck.pagina = Math.min(deck.pagina, n)
    mandarDeck(io.to('controle'))
    if (estado.modo === 'slides') mandarEstado(io)
  }))

  s.on('slides:ir', so((n) => {
    if (!deck || !Number.isInteger(n)) return
    deck.pagina = Math.max(1, deck.total ? Math.min(n, deck.total) : n)
    mandarDeck(io.to('controle'))
    if (estado.modo === 'slides') mandarEstado(io)
  }))

  // ---- quadro ----
  // qualquer cliente (tela ou controle) pode pedir o quadro atual ao montar o componente
  s.on('q:pedir', () => s.emit('q:estado', snap()))

  s.on('q:img-add', so((img) => {
    quadro.imagens = quadro.imagens.filter((i) => i.id !== img.id).concat(img)
    s.broadcast.emit('q:img-add', img)
  }))

  s.on('q:img-mov', so((m) => {
    const i = quadro.imagens.find((x) => x.id === m.id)
    if (i) for (const k of ['x', 'y', 'w', 'h']) if (typeof m[k] === 'number') i[k] = m[k]
    s.broadcast.emit('q:img-mov', m)
  }))

  s.on('q:img-del', so((id) => {
    quadro.imagens = quadro.imagens.filter((i) => i.id !== id)
    s.broadcast.emit('q:img-del', id)
  }))

  s.on('q:pts', so((m) => {
    let t = quadro.tracos.findLast((x) => x.id === m.id)
    if (!t) {
      t = { id: m.id, cor: m.cor, tam: m.tam, borracha: m.borracha, pts: [] }
      quadro.tracos.push(t)
    }
    t.pts.push(...m.pts)
    s.broadcast.emit('q:pts', m)
  }))

  s.on('q:mov-tracos', so(({ ids, dx, dy }) => {
    if (!Array.isArray(ids) || typeof dx !== 'number' || typeof dy !== 'number') return
    for (const t of quadro.tracos) {
      if (ids.includes(t.id)) t.pts = t.pts.map(([x, y]) => [x + dx, y + dy])
    }
    s.broadcast.emit('q:mov-tracos', { ids, dx, dy })
  }))

  s.on('q:del-tracos', so((ids) => {
    if (!Array.isArray(ids)) return
    quadro.tracos = quadro.tracos.filter((t) => !ids.includes(t.id))
    s.broadcast.emit('q:del-tracos', ids)
  }))

  s.on('q:desfazer', so(() => {
    quadro.tracos.pop()
    io.emit('q:desfazer')
  }))

  s.on('q:limpar', so(() => {
    quadro = { imagens: [], tracos: [] }
    io.emit('q:estado', snap())
  }))
})

const porta = process.env.PORT || 3001
server.listen(porta, () => console.log(`ICOP rodando na porta ${porta}`))
