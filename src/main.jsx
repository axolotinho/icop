import { createRoot } from 'react-dom/client'
import './styles.css'
import Display from './Display'
import Controller from './Controller'

const modoControle = new URLSearchParams(location.search).has('senha')
createRoot(document.getElementById('root')).render(modoControle ? <Controller /> : <Display />)
