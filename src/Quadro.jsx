import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { socket } from './socket'

const ZMIN = 0.5
const ZMAX = 6
const L = 1024 // largura lógica; a altura acompanha a proporção da tela de exibição
const novoId = () => Math.random().toString(36).slice(2) + Date.now().toString(36)
const lim = (v, a, b) => Math.min(b, Math.max(a, v))
const altura = (d) => (d?.w > 0 && d?.h > 0 ? lim(Math.round((L * d.h) / d.w), 300, 2000) : 768)

// desenha o traço t a partir do ponto de índice `de`
function seg(ctx, t, de) {
  const p = t.pts
  ctx.save()
  ctx.globalCompositeOperation = t.borracha ? 'destination-out' : 'source-over'
  ctx.strokeStyle = t.cor
  ctx.fillStyle = t.cor
  ctx.lineWidth = t.tam
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (p.length === 1) {
    ctx.beginPath()
    ctx.arc(p[0][0], p[0][1], t.tam / 2, 0, Math.PI * 2)
    ctx.fill()
  } else if (p.length > 1) {
    ctx.beginPath()
    ctx.moveTo(...p[Math.max(0, de - 1)])
    for (let i = Math.max(1, de); i < p.length; i++) ctx.lineTo(...p[i])
    ctx.stroke()
  }
  ctx.restore()
}

/* ---- geometria para seleção ---- */
function distSeg(px, py, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 ? lim(((px - a[0]) * dx + (py - a[1]) * dy) / l2, 0, 1) : 0
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy))
}

// o segmento p-q cruza o retângulo r? (Liang–Barsky)
function cruza(p, q, r) {
  let t0 = 0
  let t1 = 1
  const dx = q[0] - p[0]
  const dy = q[1] - p[1]
  const testes = [[-dx, p[0] - r.x0], [dx, r.x1 - p[0]], [-dy, p[1] - r.y0], [dy, r.y1 - p[1]]]
  for (const [pp, qq] of testes) {
    if (pp === 0) {
      if (qq < 0) return false
    } else {
      const t = qq / pp
      if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t }
      else { if (t < t0) return false; if (t < t1) t1 = t }
    }
  }
  return true
}

const tocaTraco = (t, x, y, tol) => {
  if (t.borracha) return false
  const p = t.pts
  const r = t.tam / 2 + tol
  if (p.length === 1) return Math.hypot(x - p[0][0], y - p[0][1]) <= r
  for (let i = 1; i < p.length; i++) if (distSeg(x, y, p[i - 1], p[i]) <= r) return true
  return false
}

const tracoNaCaixa = (t, r) => {
  if (t.borracha) return false
  const p = t.pts
  if (p.length === 1) return p[0][0] >= r.x0 && p[0][0] <= r.x1 && p[0][1] >= r.y0 && p[0][1] <= r.y1
  for (let i = 1; i < p.length; i++) if (cruza(p[i - 1], p[i], r)) return true
  return false
}

function caixaTraco(t) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of t.pts) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  const m = t.tam / 2
  return { x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m }
}

const Quadro = forwardRef(function Quadro(
  { interativo = false, ferramenta = 'selecionar', cor = '#1b1b1b', tam = 6, pontos = false, exibicao = false, onSel, onZoom },
  ref,
) {
  const [imagens, setImagens] = useState([])
  const [sel, setSel] = useState({ i: [], t: [] })
  const [A, setA] = useState(768)
  const [k, setK] = useState(1)
  const [vista, setVista] = useState({ z: 1, x: 0, y: 0 })
  const [marq, setMarq] = useState(null)
  const [, setTick] = useState(0)
  const bump = () => setTick((n) => n + 1)

  const area = useRef(null)
  const tabRef = useRef(null)
  const cv = useRef(null)
  const tracos = useRef([])
  const imgsRef = useRef([])
  const selRef = useRef(sel)
  const vistaRef = useRef(vista)
  const kRef = useRef(k)
  const Aref = useRef(A)
  const onSelRef = useRef()
  const onZoomRef = useRef()
  const ptrs = useRef(new Map())
  const gesto = useRef(null)
  const acao = useRef(null)
  const ignorar = useRef(false)
  imgsRef.current = imagens
  selRef.current = sel
  vistaRef.current = vista
  kRef.current = k
  Aref.current = A
  onSelRef.current = onSel
  onZoomRef.current = onZoom

  const ctx = () => cv.current.getContext('2d')
  const redesenhar = () => {
    const c = cv.current
    if (!c) return
    const g = c.getContext('2d')
    g.clearRect(0, 0, c.width, c.height)
    tracos.current.forEach((t) => seg(g, t, 0))
  }

  /* ---- zoom / pan (só visual, local) ---- */
  const aplicarVista = (z, x, y) => {
    const W = L * kRef.current
    const H = Aref.current * kRef.current
    z = lim(z, ZMIN, ZMAX)
    const v = z <= 1
      ? { z, x: (W - W * z) / 2, y: (H - H * z) / 2 } // menor que a tela: fica centralizado
      : { z, x: lim(x, W - W * z, 0), y: lim(y, H - H * z, 0) }
    vistaRef.current = v
    setVista(v)
    onZoomRef.current?.(z)
  }
  const zoomEm = (cx, cy, f) => {
    const v = vistaRef.current
    const kk = kRef.current
    const z2 = lim(v.z * f, ZMIN, ZMAX)
    const wx = (cx - v.x) / (kk * v.z)
    const wy = (cy - v.y) / (kk * v.z)
    aplicarVista(z2, cx - wx * kk * z2, cy - wy * kk * z2)
  }

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      setK(Math.min(width / L, height / Aref.current) || 1)
    })
    ro.observe(area.current)
    return () => ro.disconnect()
  }, [])

  // a altura lógica mudou: recalcula o encaixe e redesenha (o canvas é limpo ao mudar de tamanho)
  useEffect(() => {
    const el = area.current
    setK(Math.min(el.clientWidth / L, el.clientHeight / A) || 1)
    redesenhar()
    const v = vistaRef.current
    aplicarVista(v.z, v.x, v.y)
  }, [A])

  useEffect(() => {
    const v = vistaRef.current
    aplicarVista(v.z, v.x, v.y)
  }, [k])

  useEffect(() => { onSelRef.current?.({ i: sel.i.length, t: sel.t.length }) }, [sel])
  useEffect(() => { if (ferramenta !== 'selecionar' && ferramenta !== 'area') setSel({ i: [], t: [] }) }, [ferramenta])

  /* ---- sincronização ---- */
  useEffect(() => {
    const est = (q) => {
      setImagens(q.imagens)
      tracos.current = q.tracos
      setA(altura(q.dim))
      setSel({ i: [], t: [] })
      redesenhar()
    }
    const dim = (d) => setA(altura(d))
    const pts = (m) => {
      let t = tracos.current.find((x) => x.id === m.id)
      if (!t) {
        t = { id: m.id, cor: m.cor, tam: m.tam, borracha: m.borracha, pts: [] }
        tracos.current.push(t)
      }
      const de = t.pts.length
      t.pts.push(...m.pts)
      seg(ctx(), t, de)
    }
    const add = (i) => setImagens((a) => a.filter((x) => x.id !== i.id).concat(i))
    const mov = (m) => setImagens((a) => a.map((x) => (x.id === m.id ? { ...x, ...m } : x)))
    const del = (id) => setImagens((a) => a.filter((x) => x.id !== id))
    const movT = ({ ids, dx, dy }) => {
      tracos.current.forEach((t) => { if (ids.includes(t.id)) t.pts = t.pts.map(([x, y]) => [x + dx, y + dy]) })
      redesenhar()
      bump()
    }
    const delT = (ids) => {
      tracos.current = tracos.current.filter((t) => !ids.includes(t.id))
      redesenhar()
      bump()
    }
    const des = () => {
      tracos.current.pop()
      redesenhar()
      setSel((s) => ({ ...s, t: s.t.filter((id) => tracos.current.some((t) => t.id === id)) }))
    }
    // pede o quadro atual: sem isso, o que foi desenhado antes de o componente existir não aparece
    const pedir = () => socket.emit('q:pedir')

    socket.on('q:estado', est)
    socket.on('q:dim', dim)
    socket.on('q:pts', pts)
    socket.on('q:img-add', add)
    socket.on('q:img-mov', mov)
    socket.on('q:img-del', del)
    socket.on('q:mov-tracos', movT)
    socket.on('q:del-tracos', delT)
    socket.on('q:desfazer', des)
    socket.on('connect', pedir)
    pedir()
    return () => {
      socket.off('q:estado', est)
      socket.off('q:dim', dim)
      socket.off('q:pts', pts)
      socket.off('q:img-add', add)
      socket.off('q:img-mov', mov)
      socket.off('q:img-del', del)
      socket.off('q:mov-tracos', movT)
      socket.off('q:del-tracos', delT)
      socket.off('q:desfazer', des)
      socket.off('connect', pedir)
    }
  }, [])

  useImperativeHandle(ref, () => ({
    adicionar(src, w, h) {
      const f = Math.min(1, 520 / Math.max(w, h), (Aref.current * 0.8) / h)
      const img = { id: novoId(), src, w: w * f, h: h * f, x: (L - w * f) / 2, y: (Aref.current - h * f) / 2 }
      setImagens((a) => a.concat(img))
      socket.emit('q:img-add', img)
      setSel({ i: [img.id], t: [] })
    },
    escalar(fa) {
      selRef.current.i.forEach((id) => {
        const i = imgsRef.current.find((x) => x.id === id)
        if (!i) return
        const w = i.w * fa
        const h = i.h * fa
        const m = { id, x: i.x - (w - i.w) / 2, y: i.y - (h - i.h) / 2, w, h }
        setImagens((a) => a.map((x) => (x.id === id ? { ...x, ...m } : x)))
        socket.emit('q:img-mov', m)
      })
    },
    excluir() {
      const s = selRef.current
      s.i.forEach((id) => socket.emit('q:img-del', id))
      setImagens((a) => a.filter((x) => !s.i.includes(x.id)))
      if (s.t.length) {
        tracos.current = tracos.current.filter((t) => !s.t.includes(t.id))
        redesenhar()
        socket.emit('q:del-tracos', s.t)
      }
      setSel({ i: [], t: [] })
    },
    desfazer: () => socket.emit('q:desfazer'),
    limpar: () => socket.emit('q:limpar'),
    zoomMais: () => zoomEm((L * kRef.current) / 2, (Aref.current * kRef.current) / 2, 1.4),
    zoomMenos: () => zoomEm((L * kRef.current) / 2, (Aref.current * kRef.current) / 2, 1 / 1.4),
    ajustar: () => aplicarVista(1, 0, 0),
  }), [])

  /* ---- interação (só no controle) ---- */
  const ponto = (e) => {
    const r = tabRef.current.getBoundingClientRect()
    const v = vistaRef.current
    const kz = k * v.z
    return [(e.clientX - r.left - v.x) / kz, (e.clientY - r.top - v.y) / kz]
  }

  // caixa que envolve a seleção
  const caixaDe = (s) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    const junta = (a, b, c, d) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d) }
    s.i.forEach((id) => { const i = imgsRef.current.find((x) => x.id === id); if (i) junta(i.x, i.y, i.x + i.w, i.y + i.h) })
    s.t.forEach((id) => { const t = tracos.current.find((x) => x.id === id); if (t) { const c = caixaTraco(t); junta(c.x0, c.y0, c.x1, c.y1) } })
    return x0 === Infinity ? null : { x0, y0, x1, y1 }
  }

  const enviar = (a) => {
    const novos = a.t.pts.slice(a.enviado)
    if (!novos.length) return
    const { id, cor: c, tam: w, borracha } = a.t
    socket.emit('q:pts', { id, cor: c, tam: w, borracha, pts: novos })
    a.enviado = a.t.pts.length
    a.t0 = Date.now()
  }

  const flushMover = (a) => {
    if (a.ult) a.imgs.forEach((o) => socket.emit('q:img-mov', { id: o.id, x: o.x + a.ult.dx, y: o.y + a.ult.dy }))
    if (a.pend[0] || a.pend[1]) {
      socket.emit('q:mov-tracos', { ids: a.ids, dx: a.pend[0], dy: a.pend[1] })
      a.pend = [0, 0]
    }
  }

  const iniciarMover = (s, x, y) => {
    acao.current = {
      tipo: 'mover', x0: x, y0: y, ax: 0, ay: 0, t: 0, pend: [0, 0], ids: s.t, ult: null,
      imgs: s.i.map((id) => { const i = imgsRef.current.find((q) => q.id === id); return { id, x: i.x, y: i.y } }),
    }
  }

  // o que há sob o ponto (desenho antes de imagem, pois fica por cima)
  const alvoEm = (x, y) => {
    const tol = 14 / (k * vistaRef.current.z)
    const ht = [...tracos.current].reverse().find((t) => tocaTraco(t, x, y, tol))
    if (ht) return { i: [], t: [ht.id] }
    const hi = [...imgsRef.current].reverse().find((i) => x >= i.x && x <= i.x + i.w && y >= i.y && y <= i.y + i.h)
    return hi ? { i: [hi.id], t: [] } : { i: [], t: [] }
  }

  const encerrar = (cancelar) => {
    const a = acao.current
    acao.current = null
    if (!a) return
    if (a.tipo === 'traco') {
      if (cancelar && a.enviado === 0) {
        // era o início de uma pinça, não um traço: descarta
        tracos.current = tracos.current.filter((t) => t !== a.t)
        redesenhar()
      } else {
        enviar(a)
      }
    } else if (a.tipo === 'mover') {
      flushMover(a)
    } else if (a.tipo === 'marq') {
      setMarq(null)
      if (cancelar) return // a seleção anterior continua
      const kz = k * vistaRef.current.z
      const r = a.x1 === undefined ? null : {
        x0: Math.min(a.x0, a.x1), y0: Math.min(a.y0, a.y1), x1: Math.max(a.x0, a.x1), y1: Math.max(a.y0, a.y1),
      }
      if (r && ((r.x1 - r.x0) * kz > 6 || (r.y1 - r.y0) * kz > 6)) {
        setSel({
          i: imgsRef.current.filter((m) => m.x < r.x1 && m.x + m.w > r.x0 && m.y < r.y1 && m.y + m.h > r.y0).map((m) => m.id),
          t: tracos.current.filter((t) => tracoNaCaixa(t, r)).map((t) => t.id),
        })
      } else {
        setSel(alvoEm(a.x0, a.y0)) // toque: seleciona o item (ou limpa, se não houver nenhum)
      }
    }
  }

  const iniciarGesto = () => {
    const [a, b] = [...ptrs.current.values()]
    const r = tabRef.current.getBoundingClientRect()
    gesto.current = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      cx: (a.x + b.x) / 2 - r.left,
      cy: (a.y + b.y) / 2 - r.top,
    }
  }

  const baixo = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (ptrs.current.size === 2) { encerrar(true); iniciarGesto(); return }
    if (ptrs.current.size > 2 || ignorar.current) return

    const [x, y] = ponto(e)
    if (ferramenta === 'mao') {
      acao.current = { tipo: 'pan', lx: e.clientX, ly: e.clientY }
    } else if (ferramenta === 'selecionar' || ferramenta === 'area') {
      const cx = caixaDe(selRef.current)
      if (cx && x >= cx.x0 && x <= cx.x1 && y >= cx.y0 && y <= cx.y1) {
        iniciarMover(selRef.current, x, y) // arrasta o que já está selecionado
        return
      }
      if (ferramenta === 'selecionar') {
        // arrastar direto um item
        const alvo = alvoEm(x, y)
        if (alvo.i.length || alvo.t.length) {
          setSel(alvo)
          iniciarMover(alvo, x, y)
          return
        }
      }
      // retângulo de seleção (na ferramenta "área" começa mesmo sobre um item)
      acao.current = { tipo: 'marq', x0: x, y0: y }
      setMarq({ x0: x, y0: y, x1: x, y1: y })
    } else {
      const borracha = ferramenta === 'borracha'
      const t = { id: novoId(), cor, tam: borracha ? tam * 3 : tam, borracha, pts: [[x, y]] }
      tracos.current.push(t)
      acao.current = { tipo: 'traco', t, enviado: 0, t0: 0, inicio: Date.now() }
      seg(ctx(), t, 0)
    }
  }

  const mexer = (e) => {
    if (ptrs.current.has(e.pointerId)) ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (gesto.current) {
      if (ptrs.current.size < 2) return
      const [a, b] = [...ptrs.current.values()]
      const r = tabRef.current.getBoundingClientRect()
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const cx = (a.x + b.x) / 2 - r.left
      const cy = (a.y + b.y) / 2 - r.top
      const g = gesto.current
      const v = vistaRef.current
      const z2 = lim(v.z * (dist / g.dist), ZMIN, ZMAX)
      const wx = (g.cx - v.x) / (k * v.z)
      const wy = (g.cy - v.y) / (k * v.z)
      aplicarVista(z2, cx - wx * k * z2, cy - wy * k * z2)
      g.dist = dist
      g.cx = cx
      g.cy = cy
      return
    }
    const a = acao.current
    if (!a || ptrs.current.size > 1 || ignorar.current) return

    const agora = Date.now()
    const [x, y] = ponto(e)
    if (a.tipo === 'traco') {
      const de = a.t.pts.length
      a.t.pts.push([x, y])
      seg(ctx(), a.t, de)
      if (agora - a.inicio > 120 && agora - a.t0 > 40) enviar(a) // espera um instante: pode ser o começo de uma pinça
    } else if (a.tipo === 'mover') {
      const dx = x - a.x0
      const dy = y - a.y0
      if (a.imgs.length) {
        setImagens((arr) => arr.map((i) => {
          const o = a.imgs.find((q) => q.id === i.id)
          return o ? { ...i, x: o.x + dx, y: o.y + dy } : i
        }))
        a.ult = { dx, dy }
      }
      if (a.ids.length) {
        const ddx = dx - a.ax
        const ddy = dy - a.ay
        a.ax = dx
        a.ay = dy
        tracos.current.forEach((t) => { if (a.ids.includes(t.id)) t.pts = t.pts.map(([px, py]) => [px + ddx, py + ddy]) })
        redesenhar()
        a.pend[0] += ddx
        a.pend[1] += ddy
        bump()
      }
      if (agora - a.t > 40) { a.t = agora; flushMover(a) }
    } else if (a.tipo === 'pan') {
      const v = vistaRef.current
      aplicarVista(v.z, v.x + e.clientX - a.lx, v.y + e.clientY - a.ly)
      a.lx = e.clientX
      a.ly = e.clientY
    } else if (a.tipo === 'marq') {
      a.x1 = x
      a.y1 = y
      setMarq({ x0: a.x0, y0: a.y0, x1: x, y1: y })
    }
  }

  const cima = (e) => {
    ptrs.current.delete(e.pointerId)
    if (ptrs.current.size === 0) ignorar.current = false
    if (gesto.current) {
      if (ptrs.current.size < 2) {
        gesto.current = null
        ignorar.current = ptrs.current.size > 0 // o dedo que sobrou não desenha
      }
      return
    }
    if (ignorar.current) return
    encerrar(false)
  }

  const roda = (e) => {
    const r = tabRef.current.getBoundingClientRect()
    zoomEm(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15)
  }

  const eventos = interativo
    ? { onPointerDown: baixo, onPointerMove: mexer, onPointerUp: cima, onPointerCancel: cima, onWheel: roda, onContextMenu: (e) => e.preventDefault() }
    : {}

  const kz = k * vista.z
  const cx = interativo && (ferramenta === 'selecionar' || ferramenta === 'area') ? caixaDe(sel) : null

  return (
    <div ref={area} className="qarea">
      <div ref={tabRef} className={'qtab' + (interativo ? ' ativo ' + ferramenta : '') + (exibicao ? ' exib' : '')}
        style={{ width: L * k, height: A * k }} {...eventos}>
        <div className={'mundo' + (pontos ? ' pontos' : '')}
          style={{ height: A, transform: `translate(${vista.x}px, ${vista.y}px) scale(${kz})` }}>
          {imagens.map((i) => (
            <img key={i.id} src={i.src} alt="" draggable={false} style={{ left: i.x, top: i.y, width: i.w, height: i.h }} />
          ))}
          <canvas ref={cv} width={L} height={A} />
          {cx && (
            <div className="selbox" style={{ left: cx.x0, top: cx.y0, width: cx.x1 - cx.x0, height: cx.y1 - cx.y0, borderWidth: 2 / kz }} />
          )}
          {interativo && marq && (
            <div className="marq" style={{
              left: Math.min(marq.x0, marq.x1), top: Math.min(marq.y0, marq.y1),
              width: Math.abs(marq.x1 - marq.x0), height: Math.abs(marq.y1 - marq.y0), borderWidth: 1.5 / kz,
            }} />
          )}
        </div>
      </div>
    </div>
  )
})

export default Quadro
