import { Link } from 'react-router-dom'
import IconDeck from './IconDeck.jsx'

// English, Mobbin-style landing. Neutral/monochrome, lots of whitespace,
// centered hero, pill CTAs, trusted-by logos, success-story image cards.
export default function Landing() {
  return (
    <div className="mb" dir="ltr">
      {/* floating pill nav */}
      <header className="mb-nav">
        <div className="mb-nav-pill">
          <span className="mb-word">aktham</span>
          <button className="mb-burger" aria-label="Menu">
            <span /><span />
          </button>
        </div>
      </header>

      {/* trusted by */}
      <section className="mb-trusted">
        <span className="mb-trusted-label">Trusted by teams at</span>
        <div className="mb-logos">
          <span className="mb-logo mb-logo-text" style={{ color: '#e8202a' }}>jahez</span>
          <img className="mb-logo" src="/logos/recent/misk.png" alt="MiSK" />
          <img className="mb-logo" src="/logos/auto/e39.png" alt="NEOM" />
          <img className="mb-logo" src="/logos/recent/alrajhi-bank.png" alt="Al Rajhi" />
        </div>
      </section>

      {/* success stories */}
      <section className="mb-stories">
        <h2>Success stories</h2>
        <div className="mb-story-scroll">
          {STORIES.map((s) => (
            <article className="mb-story" key={s.label} style={{ background: s.bg }}>
              <span className="mb-story-label">{s.label}</span>
              <div className="mb-story-stats">
                {s.stats.map((st) => (
                  <div className="mb-stat" key={st.label}>
                    <strong>{st.num}</strong>
                    <span>{st.label}</span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* hero */}
      <section className="mb-hero">
        <IconDeck />
        <h1>Targeted Expansion Channels</h1>
        <p>70% of executives rank “talent leakage” as the biggest challenge they face.</p>
        <div className="mb-cta">
          <Link to="/browse" className="mb-btn mb-btn-dark">All companies</Link>
          <Link to="/browse" className="mb-btn mb-btn-ghost">My list <Arrow /></Link>
        </div>
      </section>
    </div>
  )
}

const STORIES = [
  {
    label: 'Center3',
    bg: 'linear-gradient(160deg,#1f2a44,#0d1322)',
    stats: [
      { num: '85%', label: 'data cleaning accuracy' },
      { num: '100%', label: 'decision-center unification' },
      { num: '94%', label: 'operational response speed' },
    ],
  },
  {
    label: 'TDF',
    bg: 'linear-gradient(160deg,#3a6b4f,#14241a)',
    stats: [
      { num: '85%', label: 'data cleaning accuracy' },
      { num: '100%', label: 'decision-center unification' },
      { num: '94%', label: 'operational response speed' },
    ],
  },
  {
    label: 'Elm',
    bg: 'linear-gradient(160deg,#26303a,#10161c)',
    stats: [
      { num: '85%', label: 'data cleaning accuracy' },
      { num: '100%', label: 'decision-center unification' },
      { num: '94%', label: 'operational response speed' },
    ],
  },
]

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden style={{ verticalAlign: 'middle' }}>
      <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}
