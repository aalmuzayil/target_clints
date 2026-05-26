// Interactive (auto-scrolling, pause-on-hover) logo strip — Mobbin style.
// Uses the 7 "completed" client logos.
const LOGOS = [
  { src: '/logos/completed/al-rajhi-foundation.webp', alt: 'Al Rajhi Foundation' },
  { src: '/logos/completed/al-rajhi-takaful.png', alt: 'Al Rajhi Takaful' },
  { src: '/logos/completed/center3.jpg', alt: 'center3' },
  { src: '/logos/completed/emdad-elm.png', alt: 'Emdad by Elm' },
  { src: '/logos/completed/half-m.png', alt: 'Half M' },
  { src: '/logos/completed/sccc-stc.jpg', alt: 'SCCC by stc' },
  { src: '/logos/completed/tourism-dev-fund.jpg', alt: 'Tourism Development Fund' },
]

export default function LogoMarquee() {
  // render the set twice so the -50% translate loops seamlessly
  const items = [...LOGOS, ...LOGOS]
  return (
    <div className="mb-marquee" aria-label="clients">
      <div className="mb-marquee-track">
        {items.map((it, i) => (
          <img key={i} className="mb-marquee-logo" src={it.src} alt={it.alt} aria-hidden={i >= LOGOS.length} />
        ))}
      </div>
    </div>
  )
}
