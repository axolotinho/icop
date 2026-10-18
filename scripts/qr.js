// Gera o QR code do controle (lê a SENHA do arquivo .env).
//   npm run qr                          -> usa o IP da sua rede + porta 5173 (modo dev)
//   npm run qr -- https://seu-site.com  -> usa o endereço informado
import 'dotenv/config'
import os from 'os'
import QRCode from 'qrcode'

const senha = process.env.SENHA
if (!senha) {
  console.error('Defina a SENHA no arquivo .env (veja .env.example).')
  process.exit(1)
}

function ipLocal() {
  const todos = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => (i.family === 'IPv4' || i.family === 4) && !i.internal)
  return (todos.find((i) => i.address.startsWith('192.168.')) || todos[0])?.address
}

let base = process.argv[2]
if (!base) {
  const ip = ipLocal()
  if (!ip) {
    console.error('Não encontrei o IP da rede. Informe o endereço: npm run qr -- http://IP:5173')
    process.exit(1)
  }
  base = `http://${ip}:5173`
}

const url = `${base.replace(/\/$/, '')}/?senha=${encodeURIComponent(senha)}`
await QRCode.toFile('qr-controle.png', url, { width: 600, margin: 2 })
console.log(await QRCode.toString(url, { type: 'terminal', small: true }))
console.log('Link:', url)
console.log('Imagem salva em qr-controle.png')
