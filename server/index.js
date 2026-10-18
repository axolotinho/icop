import 'dotenv/config'
import express from 'express'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import { Server } from 'socket.io'

const senha = process.env.SENHA
if (!senha) {
  console.error('Defina a variável de ambiente SENHA (veja .env.example).')
  process.exit(1)
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

app.use(express.static(dist))
app.use((_, res) => res.sendFile(path.join(dist, 'index.html')))

io.on('connection', (s) => {
  const so = (fn) => (...a) => { if (s.data.ok) fn(...a) } // só quem tem a senha

  s.on('tela', () => {
    s.join('tela')
    s.emit('estado', estado)
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
    s.emit('estado', estado)
    s.emit('q:estado', snap())
  })

  s.on('mostrar', so((novo) => {
    estado = novo
    io.emit('estado', estado)
  }))

  s.on('yt', so((cmd) => io.to('tela').emit('yt', cmd)))

  s.on('yt-status', (st) => {
    if (s.rooms.has('tela')) io.to('controle').emit('yt-status', st)
  })

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
