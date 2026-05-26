// Mobbin "Find design patterns in seconds"-style showcase: a continuous
// horizontal scroll of success-story phone screens. Pauses on hover.
const V = '2' // bump to refresh cached story images
const SCREENS = [
  { src: `/logos/stories/half-million.png?v=${V}`, alt: '½M' },
  { src: `/logos/stories/center3.png?v=${V}`, alt: 'center3' },
  { src: `/logos/stories/tdf.png?v=${V}`, alt: 'Tourism Development Fund' },
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
