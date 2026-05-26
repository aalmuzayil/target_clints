import IconDeck from './IconDeck.jsx'
import LogoMarquee from './LogoMarquee.jsx'
import { useLang } from './i18n.jsx'

// Frame 1334 top: hero (icon deck + heading + subtitle), then the interactive
// "Trusted by teams at" marquee, then the CTAs. Follows active language / direction.
export default function HeroIntro() {
  const { t, dir } = useLang()
  return (
    <div className="mb mb-embed" dir={dir} style={{ textAlign: 'center' }}>
      <section className="mb-hero">
        <IconDeck />
        <h1>{t('heroTitle')}</h1>
        <p>{t('heroSub')}</p>

        <div className="mb-trusted-inline">
          <span className="mb-trusted-label">{t('trusted')}</span>
          <LogoMarquee />
        </div>

        <div className="mb-cta">
          <a href="#entities" className="mb-btn mb-btn-dark">
            <span>{t('allCompanies')}</span>
          </a>
          <a href="#entities" className="mb-btn mb-btn-ghost">
            <span>{t('myList')}</span>
          </a>
        </div>
      </section>
    </div>
  )
}
