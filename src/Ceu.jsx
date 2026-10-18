// [topo %, largura, altura, duração s]
const NUVENS = [[8, 220, 60, 90], [22, 300, 80, 140], [48, 180, 50, 110], [66, 260, 70, 170], [84, 200, 55, 130]]

export default function Ceu() {
  return (
    <div className="ceu">
      {NUVENS.map(([t, w, h, d], i) => (
        <i key={i} className="nuvem"
          style={{ top: `${t}%`, width: w, height: h, animationDuration: `${d}s`, animationDelay: `-${(d * i) / 5}s` }} />
      ))}
    </div>
  )
}
