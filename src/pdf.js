import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.js?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

export const abrirPdf = (id) => pdfjsLib.getDocument({ url: `/slides/${id}.pdf` }).promise

// Desenha a página n num canvas novo, encaixada (sem distorcer) na caixa largura x altura.
// `escala` multiplica a resolução (nitidez). Devolve { promessa -> canvas, cancelar }.
export function renderPagina(doc, n, largura, altura, escala = 1) {
  let cancelado = false
  let tarefa = null
  const promessa = (async () => {
    const page = await doc.getPage(n)
    const v1 = page.getViewport({ scale: 1 })
    const fit = Math.min(largura / v1.width, altura / v1.height)
    const viewport = page.getViewport({ scale: fit * escala })
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    if (cancelado) throw new Error('cancelado')
    tarefa = page.render({ canvasContext: canvas.getContext('2d'), viewport })
    await tarefa.promise
    return canvas
  })()
  return { promessa, cancelar: () => { cancelado = true; tarefa?.cancel() } }
}
