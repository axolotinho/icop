import { useEffect, useRef, useState } from 'react'
import { socket } from './socket'
import Ceu from './Ceu'
import Quadro from './Quadro'

const MARGEM = 16 // folga ao redor do quadro, em px da tela

function useEscala() {
  const [e, setE] = useState(1)
  useEffect(() => {
    const f = () => setE(Math.min(window.innerWidth / 1024, window.innerHeight / 768))
    f()
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  return e
}

function carregarYT() {
  return new Promise((res) => {
    if (window.YT?.Player) return res(window.YT)
    const t = document.createElement('script')
    t.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(t)
    window.onYouTubeIframeAPIReady = () => res(window.YT)
  })
}

function Video({ id }) {
  const alvo = useRef(null)
  const player = useRef(null)

  useEffect(() => {
    let vivo = true
    let timer
    carregarYT().then((YT) => {
      if (!vivo) return
      player.current = new YT.Player(alvo.current, {
        width: 1024, height: 576, videoId: id,
        playerVars: { autoplay: 1, controls: 0, rel: 0, playsinline: 1 },
        events: { onReady: (e) => e.target.playVideo() },
      })
      timer = setInterval(() => {
        const p = player.current
        if (!p?.getCurrentTime) return
        socket.emit('yt-status', { t: p.getCurrentTime(), d: p.getDuration(), tocando: p.getPlayerState() === 1 })
      }, 1000)
    })

    const cmd = (c) => {
      const p = player.current
      if (!p?.seekTo) return
      if (c.acao === 'play') p.playVideo()
      if (c.acao === 'pause') p.pauseVideo()
      if (c.acao === 'pular') p.seekTo(p.getCurrentTime() + c.s, true)
      if (c.acao === 'ir') p.seekTo(c.t, true)
    }
    socket.on('yt', cmd)
    return () => {
      vivo = false
      clearInterval(timer)
      socket.off('yt', cmd)
      player.current?.destroy?.()
    }
  }, [id])

  return <div className="video"><div ref={alvo} /></div>
}

export default function Display() {
  const [estado, setEstado] = useState({ modo: 'vazio' })
  const escala = useEscala()

  useEffect(() => {
    // informa o tamanho útil da tela: o quadro usa a mesma proporção para cobrir tudo
    const dim = () => socket.emit('tela-dim', { w: window.innerWidth - 2 * MARGEM, h: window.innerHeight - 2 * MARGEM })
    const entrar = () => { socket.emit('tela'); dim() }
    socket.on('connect', entrar)
    socket.on('estado', setEstado)
    window.addEventListener('resize', dim)
    if (socket.connected) entrar()
    return () => {
      socket.off('connect', entrar)
      socket.off('estado', setEstado)
      window.removeEventListener('resize', dim)
    }
  }, [])

  const n = estado.texto?.length || 0
  const fonte = n > 450 ? 30 : n > 250 ? 38 : n > 120 ? 46 : 56

  return (
    <>
      <Ceu />
      {estado.modo !== 'quadro' && (
      <div className="palco" style={{ transform: `translate(-50%, -50%) scale(${escala})` }}>
        {estado.modo === 'vazio' && (
          <div className="centro">
            <h1 className="logo">ICOP</h1>
            <p className="sub">Igreja Casa de Oração da Penha</p>
          </div>
        )}

        {estado.modo === 'versiculo' && (
          <div className="centro">
            <div className="cartao versiculo">
              <p style={{ fontSize: fonte }}>{estado.texto}</p>
              <strong>{estado.ref}</strong>
            </div>
          </div>
        )}

        {estado.modo === 'imagem' && <img className="foto" src={estado.src} alt="" />}

        {estado.modo === 'video' && <Video key={estado.id} id={estado.id} />}

      </div>
      )}

      {estado.modo === 'quadro' && (
        <div style={{ position: 'fixed', inset: MARGEM, zIndex: 2 }}>
          <Quadro exibicao />
        </div>
      )}
    </>
  )
}
