import { useEffect, useMemo, useRef, useState } from 'react'
import { useLang } from './i18n.jsx'

// Commission estimator shown inside an entity sheet. Anchored to the official
// pricing tiers from the methodology doc — kept implicit so the breakdown
// stays hidden. Two big numbers face each other in a dark card; the slider
// snaps to the tier breakpoints with named ticks underneath.
const COMMISSION_RATE = 0.10

// Pricing tiers from "Methodology of Pricing"
const TIERS = [
  { min: 100,   monthly: 40, cloud: 50_000,  onprem: 90_000  },
  { min: 200,   monthly: 30, cloud: 70_000,  onprem: 100_000 },
  { min: 500,   monthly: 23, cloud: 90_000,  onprem: 150_000 },
  { min: 1000,  monthly: 18, cloud: 100_000, onprem: 200_000 },
  { min: 2000,  monthly: 14, cloud: 160_000, onprem: 300_000 },
  { min: 3000,  monthly: 11, cloud: 200_000, onprem: 350_000 },
  { min: 5000,  monthly: 8,  cloud: 300_000, onprem: 500_000 },
  { min: 8000,  monthly: 6,  cloud: 400_000, onprem: 700_000 },
  { min: 15000, monthly: 4,  cloud: 500_000, onprem: 850_000 },
]
const STOP_LABELS = ['100', '200', '500', '1K', '2K', '3K', '5K', '8K', '15K+']

// experience-based touch per sector: government deals lean on-premise with a
// premium for regulatory/training overhead, semi-government leans cloud at
// baseline, and private deals are price-sensitive (light trim).
const SECTOR_PROFILE = {
  gov:     { deployment: 'onprem', factor: 1.10 },
  semi:    { deployment: 'cloud',  factor: 1.00 },
  private: { deployment: 'cloud',  factor: 0.90 },
}

function estimateCommission(tierIndex, sector) {
  const tier = TIERS[tierIndex]
  const profile = SECTOR_PROFILE[sector] || SECTOR_PROFILE.private
  const annual = tier.min * tier.monthly * 12
  const initial = profile.deployment === 'onprem' ? tier.onprem : tier.cloud
  const total = (annual + initial) * profile.factor
  return Math.round((total * COMMISSION_RATE) / 5000) * 5000
}

// approximate the entity's expected size as a nicely rounded slider default.
const BIG_NAMES = [
  'stc', 'سابك', 'معادن', 'أرامكو', 'نيوم', 'روشن', 'SEC', 'الكهرباء',
  'SNB', 'الأهلي', 'الرياض', 'الإنماء', 'أكوا باور', 'البحري', 'SAMI',
  'العقارية', 'السعودية للكهرباء', 'الراجحي', 'الإسكان الوطنية', 'NHC',
  'علم', 'هيومين', 'مرافق',
]
function defaultTierIndex(company) {
  const emp = defaultEmployeesRaw(company)
  // pick the highest tier whose min is <= emp
  let idx = 0
  for (let i = 0; i < TIERS.length; i++) if (TIERS[i].min <= emp) idx = i
  return idx
}
function defaultEmployeesRaw(company) {
  if (!company) return 1000
  if (company.employees && company.employees > 0) return company.employees
  if (company.type === 'ministry') return 5000
  if (company.type === 'authority') return 2000
  const name = company.name || ''
  if (company.type === 'semi') return BIG_NAMES.some((n) => name.includes(n)) ? 5000 : 1500
  return BIG_NAMES.some((n) => name.includes(n)) ? 3000 : 500
}
function sectorFor(company) {
  if (!company) return 'private'
  if (company.type === 'ministry' || company.type === 'authority') return 'gov'
  if (company.type === 'semi') return 'semi'
  return 'private'
}

export default function CommissionCalc({ company }) {
  const { t, lang } = useLang()
  const [sector, setSector] = useState(() => sectorFor(company))
  const [tierIndex, setTierIndex] = useState(() => defaultTierIndex(company))
  useEffect(() => {
    setSector(sectorFor(company))
    setTierIndex(defaultTierIndex(company))
  }, [company?.id])

  const commission = useMemo(() => estimateCommission(tierIndex, sector), [tierIndex, sector])
  const displayCom = useAnimatedNumber(commission)

  const fmt = (n) =>
    new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'ar-SA', { maximumFractionDigits: 0 }).format(n)
  const empLabel = STOP_LABELS[tierIndex]

  return (
    <div className="sheet-section calc-block">
      <div className="calc-header-row">
        <h4>{t('calcTitle')}</h4>
        <span className="calc-sub-inline">{t('calcSub')}</span>
      </div>

      <div className="calc-card">
        <div className="calc-card-half">
          <div className="calc-card-value">{fmt(displayCom)} <em>{t('calcCurrency')}</em></div>
          <div className="calc-card-label">{t('calcResultLabel')}</div>
        </div>
        <div className="calc-card-divider" aria-hidden />
        <div className="calc-card-half end">
          <div className="calc-card-value">{empLabel}</div>
          <div className="calc-card-label">{t('calcSize')}</div>
        </div>
      </div>

      <input
        type="range" min="0" max={TIERS.length - 1} step="1" value={tierIndex}
        onChange={(e) => setTierIndex(Number(e.target.value))}
        className="calc-slider"
        aria-label={t('calcSize')}
      />

      <div className="calc-ticks">
        {STOP_LABELS.map((lbl, i) => (
          <button
            key={lbl}
            type="button"
            className={i === tierIndex ? 'tick on' : 'tick'}
            onClick={() => setTierIndex(i)}
          >
            {lbl}
          </button>
        ))}
      </div>

      <label className="calc-field calc-sector-row">
        <span className="calc-label">{t('calcSector')}</span>
        <select className="calc-select" value={sector} onChange={(e) => setSector(e.target.value)}>
          <option value="gov">{t('calcGov')}</option>
          <option value="semi">{t('calcSemi')}</option>
          <option value="private">{t('calcPrivate')}</option>
        </select>
      </label>

      <div className="calc-info">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
          <path fill="currentColor" d="M9 21h6v-1H9v1zm3-20a7 7 0 00-4 12.74V17a1 1 0 001 1h6a1 1 0 001-1v-3.26A7 7 0 0012 1zm0 2a5 5 0 013.07 8.95l-.07.05V16h-6v-4l-.07-.05A5 5 0 0112 3z" />
        </svg>
        <span>{t('calcInfo')}</span>
      </div>

      <p className="calc-foot">{t('calcFoot')}</p>
    </div>
  )
}

function useAnimatedNumber(target) {
  const [display, setDisplay] = useState(target)
  const rafRef = useRef(0)
  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    const start = display
    const t0 = performance.now()
    const DUR = 450
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / DUR)
      const e = 1 - Math.pow(1 - p, 3)
      const next = Math.round(start + (target - start) * e)
      setDisplay(next)
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])
  return display
}
