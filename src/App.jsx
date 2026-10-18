import { useState, useEffect, useRef } from 'react'
import { useParams } from "react-router";
import './App.css'

import Piloto from './components/Piloto'
import Projecao from './components/Projecao'

function App() {
  const {codigo } = useParams()


  return (
    <>
      <div className="App">
        (codigo === null
        ? <Projecao />
        : codigo === "piloto"
        & <Piloto />
        )
      </div>
    </>
  )
}

export default App
