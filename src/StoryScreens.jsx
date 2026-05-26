// Mobbin "Find design patterns in seconds"-style showcase: a continuous
// horizontal scroll of success-story phone screens. Pauses on hover.
const SCREENS = [
  { src: '/logos/stories/half-million.png', alt: '½M' },
  { src: '/logos/stories/center3.png', alt: 'center3' },
  { src: '/logos/stories/tdf.png', alt: 'Tourism Development Fund' },
]

export default function StoryScreens() {
  const items = [...SCREENS, ...SCREENS]
  return (
    <div className="screens-marquee" aria-label="success stories">
      <div className="screens-track">
        {items.map((s, i) => (
          <img key={i} className="screen-card" src={s.src} alt={s.alt} aria-hidden={i >= SCREENS.length} draggable="false" />
        ))}
      </div>
    </div>
  )
}
