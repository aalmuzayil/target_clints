import { useEffect, useState } from 'react'

// Client app-icon tiles (from Figma "00002"). Colors taken from the tiles;
// logos use existing files where available, Jahez falls back to its wordmark.
const TILES = [
  { name: 'jahez', bg: '#f9a51a', text: 'jahez', textColor: '#e8202a' },
  { name: 'neom', bg: '#c9bd9f', logo: '/logos/auto/e39.png' },
  { name: 'alrajhi', bg: '#ffffff', logo: '/logos/recent/alrajhi-bank.png', ring: true },
]
const N = TILES.length

// Mobbin-style: a single app-icon "window" that auto-cycles through the
// client tiles with a smooth crossfade, plus dot indicators. Pauses on hover.
export default function IconDeck({ interval = 1600 }) {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const t = setInterval(() => setActive((v) => (v + 1) % N), interval)
    return () => clearInterval(t)
  }, [paused, interval])

  return (
    <div
      className="icon-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="ic-window">
        {TILES.map((tile, idx) => (
          <div
            key={tile.name}
            className={'ic-tile' + (idx === active ? ' on' : '')}
            style={{ background: tile.bg, ...(tile.ring ? { boxShadow: 'inset 0 0 0 1px #e7ebe8, 0 14px 30px rgba(20,20,20,0.14)' } : {}) }}
          >
            {tile.logo ? <img src={tile.logo} alt={tile.name} /> : <span style={{ color: tile.textColor }}>{tile.text}</span>}
          </div>
        ))}
      </div>
      <div className="ic-dots" role="tablist" aria-label="عملاؤنا">
        {TILES.map((tile, idx) => (
          <button
            key={tile.name}
            type="button"
            className={'ic-dot' + (idx === active ? ' on' : '')}
            aria-label={tile.name}
            aria-selected={idx === active}
            onClick={() => setActive(idx)}
          />
        ))}
      </div>
    </div>
  )
}
