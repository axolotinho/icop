import { useEffect, useRef, useState } from 'react'
import { socket } from './socket'
import Quadro from './Quadro'
import Ic from './Icones'
import { LIVROS } from './bible'

const senha = new URLSearchParams(window.location.search).get('senha') || ''
const mmss = (s) => {
  s = Math.max(0, Math.floor(s || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

async function reduzir(file, max = 1600) {
  const bmp = await createImageBitmap(file)
  const f = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * f)
  c.height = Math.round(bmp.height * f)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  return { src: c.toDataURL('image/jpeg', 0.82), w: c.width, h: c.height }
}

// [16,17,18,20] -> "16-18, 20"
function faixas(ns) {
  const out = []
  let i = 0
  while (i < ns.length) {
    let j = i
    while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++
    out.push(j > i ? `${ns[i]}-${ns[j]}` : `${ns[i]}`)
    i = j + 1
  }
  return out.join(', ')
}

/* ---------------- Bíblia ---------------- */
function AbaBiblia({ mostrar }) {
  const [livro, setLivro] = useState(42) // João
  const [cap, setCap] = useState(3)
  const [versos, setVersos] = useState([])
  const [status, setStatus] = useState('carregando')
  const [tentativa, setTentativa] = useState(0)
  const [sel, setSel] = useState([])
  const [multi, setMulti] = useState(false)
  const [picker, setPicker] = useState(null) // null | 'livro' | 'cap'
  const [tmp, setTmp] = useState(0)
  const cache = useRef({})
  const lista = useRef(null)

  useEffect(() => {
    let vivo = true
    const chave = `${livro}:${cap}`
    setSel([])
    lista.current?.scrollTo(0, 0)
    if (cache.current[chave]) {
      setVersos(cache.current[chave])
      setStatus('ok')
      return
    }
    setStatus('carregando')
    fetch(`https://bible-api.com/${encodeURIComponent(LIVROS[livro][1] + ' ' + cap)}?translation=almeida`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((j) => {
        const v = j.verses.map((x) => ({ n: x.verse, t: x.text.replace(/\s+/g, ' ').trim() }))
        cache.current[chave] = v
        if (vivo) { setVersos(v); setStatus('ok') }
      })
      .catch(() => vivo && setStatus('erro'))
    return () => { vivo = false }
  }, [livro, cap, tentativa])

  useEffect(() => {
    if (!sel.length) return
    lista.current?.querySelector(`[data-v="${sel[sel.length - 1]}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [sel])

  const escolher = (nums) => {
    setSel(nums)
    if (!nums.length) return mostrar({ modo: 'vazio' })
    mostrar({
      modo: 'versiculo',
      ref: `${LIVROS[livro][0]} ${cap}:${faixas(nums)}`,
      texto: nums.map((n) => versos.find((v) => v.n === n)?.t).join(' '),
    })
  }

  const tocar = (n) => {
    if (!multi) return escolher(sel.length === 1 && sel[0] === n ? [] : [n])
    escolher(sel.includes(n) ? sel.filter((x) => x !== n) : [...sel, n].sort((a, b) => a - b))
  }

  const passo = (d) => {
    if (!versos.length) return
    const ref = sel.length ? (d > 0 ? sel[sel.length - 1] : sel[0]) : d > 0 ? 0 : versos.length + 1
    escolher([Math.min(versos.length, Math.max(1, ref + d))])
  }

  const capitulo = (d) => {
    if (d < 0) {
      if (cap > 1) setCap(cap - 1)
      else if (livro > 0) { setLivro(livro - 1); setCap(LIVROS[livro - 1][2]) }
    } else {
      if (cap < LIVROS[livro][2]) setCap(cap + 1)
      else if (livro < LIVROS.length - 1) { setLivro(livro + 1); setCap(1) }
    }
  }

  return (
    <div className="painel">
      <div className="topo">
        <button className="ib" onClick={() => capitulo(-1)}><Ic n="esq" /></button>
        <button className="ib livro" onClick={() => setPicker('livro')}>{LIVROS[livro][0]} {cap} <Ic n="baixo" s={16} /></button>
        <button className="ib" onClick={() => capitulo(1)}><Ic n="dir" /></button>
        <button className={'ib' + (multi ? ' on' : '')} onClick={() => setMulti(!multi)}>Vários</button>
      </div>

      <div className="versos" ref={lista}>
        {status === 'carregando' && <p className="mudo">Carregando…</p>}
        {status === 'erro' && (
          <p className="erro">Não consegui carregar. <button className="btn" onClick={() => setTentativa(tentativa + 1)}>Tentar de novo</button></p>
        )}
        {status === 'ok' && versos.map((v) => (
          <p key={v.n} data-v={v.n} className={'v' + (sel.includes(v.n) ? ' on' : '')} onClick={() => tocar(v.n)}>
            <sup>{v.n}</sup>{v.t}
          </p>
        ))}
      </div>

      <div className="rodape">
        <button className="btn" onClick={() => passo(-1)}><Ic n="esq" s={16} /> Versículo</button>
        <button className="btn" onClick={() => passo(1)}>Versículo <Ic n="dir" s={16} /></button>
      </div>

      {picker === 'livro' && (
        <div className="picker">
          <button className="btn" onClick={() => setPicker(null)}><Ic n="x" s={16} /> Fechar</button>
          {[['Antigo Testamento', 0, 39], ['Novo Testamento', 39, 66]].map(([nome, a, b]) => (
            <div key={nome}>
              <h3>{nome}</h3>
              <div className="grade">
                {LIVROS.slice(a, b).map((l, i) => (
                  <button key={l[1]} onClick={() => { setTmp(a + i); setPicker('cap') }}>{l[0]}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {picker === 'cap' && (
        <div className="picker">
          <button className="btn" onClick={() => setPicker('livro')}><Ic n="esq" s={16} /> Livros</button>
          <h3>{LIVROS[tmp][0]} — capítulo</h3>
          <div className="grade caps">
            {Array.from({ length: LIVROS[tmp][2] }, (_, i) => i + 1).map((c) => (
              <button key={c} onClick={() => { setLivro(tmp); setCap(c); setPicker(null) }}>{c}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------- Quadro ---------------- */
const CORES = ['#1b1b1b', '#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#ffffff']
const FERRAMENTAS = [
  ['mao', 'Mover o quadro e zoom'],
  ['cursor', 'Selecionar e mover itens'],
  ['area', 'Selecionar uma parte'],
  ['lapis', 'Desenhar'],
  ['borracha', 'Borracha'],
]
const MODOS = { mao: 'mao', cursor: 'selecionar', area: 'area', lapis: 'desenhar', borracha: 'borracha' }

function AbaQuadro({ estado, mostrar }) {
  const q = useRef(null)
  const [ferr, setFerr] = useState('lapis')
  const [cor, setCor] = useState(CORES[0])
  const [tam, setTam] = useState(6)
  const [sel, setSel] = useState({ i: 0, t: 0 })
  const [zoom, setZoom] = useState(1)
  const noAr = estado.modo === 'quadro'
  const algo = sel.i + sel.t > 0
  const selecao = ferr === 'cursor' || ferr === 'area'

  async function addImg(e) {
    const f = e.target.files?.[0]
    if (!f) return
    const r = await reduzir(f, 1200)
    q.current.adicionar(r.src, r.w, r.h)
    setFerr('cursor')
    e.target.value = ''
  }

  return (
    <div className="aba">
      <div className="barra">
        {FERRAMENTAS.map(([n, nome]) => (
          <button key={n} title={nome} className={'ib ico' + (ferr === n ? ' on' : '')} onClick={() => setFerr(n)}><Ic n={n} /></button>
        ))}
        <span className="sep" />
        <button className="ib ico" title="Desfazer" onClick={() => q.current.desfazer()}><Ic n="desfazer" /></button>
        <button className="ib ico" title="Limpar quadro" onClick={() => window.confirm('Limpar o quadro inteiro?') && q.current.limpar()}><Ic n="lixo" /></button>
      </div>

      <div className="barra">
        {ferr === 'mao' && <span className="dica">Arraste para mover · pinça com dois dedos para zoom</span>}
        {selecao && (
          <>
            {ferr === 'area' && !algo && <span className="dica">Arraste para selecionar uma parte</span>}
            <label className="ib"><Ic n="imagem" /> <span className="txt">Imagem</span>
              <input type="file" accept="image/*" hidden onChange={addImg} />
            </label>
            <span className="sep" />
            <button className="ib ico" disabled={!sel.i} title="Diminuir imagem" onClick={() => q.current.escalar(0.9)}><Ic n="menor" /></button>
            <button className="ib ico" disabled={!sel.i} title="Aumentar imagem" onClick={() => q.current.escalar(1.1)}><Ic n="maior" /></button>
            <button className="ib" disabled={!algo} title="Excluir seleção" onClick={() => q.current.excluir()}><Ic n="lixo" /> <span className="txt">Excluir</span></button>
          </>
        )}
        {ferr === 'lapis' && CORES.map((c) => (
          <button key={c} className={'cor' + (cor === c ? ' on' : '')} style={{ background: c }} onClick={() => setCor(c)} />
        ))}
        {(ferr === 'lapis' || ferr === 'borracha') && (
          <input type="range" min="2" max="30" value={tam} onChange={(e) => setTam(Number(e.target.value))} />
        )}
      </div>

      <div className="qcont">
        <Quadro ref={q} interativo pontos ferramenta={MODOS[ferr]} cor={cor} tam={tam} onSel={setSel} onZoom={setZoom} />

        <button className={'mostrar' + (noAr ? ' ok' : '')} onClick={() => mostrar({ modo: 'quadro' })}>
          <Ic n={noAr ? 'check' : 'monitor'} s={16} /> {noAr ? 'Na tela' : 'Mostrar na tela'}
        </button>

        <div className="zoom">
          <button title="Aproximar" onClick={() => q.current.zoomMais()}><Ic n="mais" s={18} /></button>
          <button className="pct" title="Voltar ao tamanho normal" onClick={() => q.current.ajustar()}>{Math.round(zoom * 100)}%</button>
          <button title="Afastar" onClick={() => q.current.zoomMenos()}><Ic n="menos" s={18} /></button>
        </div>
      </div>
    </div>
  )
}

/* ---------------- Imagem ---------------- */
function AbaImagem({ mostrar }) {
  const [prev, setPrev] = useState('')
  async function escolher(e) {
    const f = e.target.files?.[0]
    if (!f) return
    const r = await reduzir(f)
    setPrev(r.src)
    mostrar({ modo: 'imagem', src: r.src })
  }
  return (
    <div className="painel livre">
      <label className="btn pri"><Ic n="imagem" /> Escolher imagem
        <input type="file" accept="image/*" onChange={escolher} hidden />
      </label>
      {prev && <img className="prev" src={prev} alt="" />}
    </div>
  )
}

/* ---------------- Vídeo ---------------- */
function AbaVideo({ estado, yt, mostrar }) {
  const [link, setLink] = useState('')
  const [arrasto, setArrasto] = useState(null)
  const cmd = (c) => socket.emit('yt', c)
  const id = link.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/)?.[1]
  const ativo = estado.modo === 'video'

  return (
    <div className="painel livre">
      <label className="rotulo">Link do YouTube
        <input className="campo" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://youtu.be/..." />
      </label>
      <button className="btn pri" disabled={!id} onClick={() => mostrar({ modo: 'video', id })}><Ic n="video" /> Mostrar vídeo na tela</button>

      {ativo && (
        <div className="player">
          <input type="range" min="0" max={yt.d || 1} step="1" value={arrasto ?? yt.t}
            onChange={(e) => setArrasto(Number(e.target.value))}
            onPointerUp={() => { if (arrasto !== null) cmd({ acao: 'ir', t: arrasto }); setArrasto(null) }} />
          <div className="tempo"><span>{mmss(arrasto ?? yt.t)}</span><span>{mmss(yt.d)}</span></div>
          <div className="linha">
            <button className="btn" onClick={() => cmd({ acao: 'pular', s: -10 })}>−10s</button>
            <button className="btn pri" onClick={() => cmd({ acao: yt.tocando ? 'pause' : 'play' })}>
              <Ic n={yt.tocando ? 'pause' : 'play'} s={18} /> {yt.tocando ? 'Pausar' : 'Tocar'}
            </button>
            <button className="btn" onClick={() => cmd({ acao: 'pular', s: 10 })}>+10s</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------- Controle ---------------- */
const ABAS = [['biblia', 'livro', 'Bíblia'], ['quadro', 'quadro', 'Quadro'], ['imagem', 'imagem', 'Imagem'], ['video', 'video', 'Vídeo']]

export default function Controller() {
  const [ok, setOk] = useState(null)
  const [aba, setAba] = useState('biblia')
  const [estado, setEstado] = useState({ modo: 'vazio' })
  const [yt, setYt] = useState({ t: 0, d: 0, tocando: false })
  const [aberta, setAberta] = useState(() => {
    try { return localStorage.getItem('rail') !== '0' } catch { return true }
  })

  const alternar = (v) => {
    setAberta(v)
    try { localStorage.setItem('rail', v ? '1' : '0') } catch { /* ignora */ }
  }

  useEffect(() => {
    const entrar = () => socket.emit('controle', senha, setOk)
    socket.on('connect', entrar)
    socket.on('estado', setEstado)
    socket.on('yt-status', setYt)
    if (socket.connected) entrar()
    return () => {
      socket.off('connect', entrar)
      socket.off('estado', setEstado)
      socket.off('yt-status', setYt)
    }
  }, [])

  const mostrar = (e) => socket.emit('mostrar', e)

  if (ok !== true) {
    return (
      <div className="ctl">
        <section className="conteudo">
          <div className="painel livre"><p>{ok === null ? 'Conectando…' : 'Senha inválida. Escaneie o QR code novamente.'}</p></div>
        </section>
      </div>
    )
  }

  return (
    <div className="ctl">
      {aberta ? (
        <aside className="rail">
          <button title="Minimizar" onClick={() => alternar(false)}><Ic n="painel" /></button>
          {ABAS.map(([k, icone, nome]) => (
            <button key={k} className={aba === k ? 'on' : ''} onClick={() => setAba(k)}>
              <Ic n={icone} /><span>{nome}</span>
            </button>
          ))}
          <i className="esp" />
          <button title="Limpar tela" onClick={() => mostrar({ modo: 'vazio' })}><Ic n="x" /><span>Limpar</span></button>
        </aside>
      ) : (
        <button className="alca" title="Abrir menu" onClick={() => alternar(true)}><Ic n="dir" s={16} /></button>
      )}

      <section className="conteudo">
        {aba === 'biblia' && <AbaBiblia mostrar={mostrar} />}
        {aba === 'quadro' && <AbaQuadro estado={estado} mostrar={mostrar} />}
        {aba === 'imagem' && <AbaImagem mostrar={mostrar} />}
        {aba === 'video' && <AbaVideo estado={estado} yt={yt} mostrar={mostrar} />}
      </section>
    </div>
  )
}
