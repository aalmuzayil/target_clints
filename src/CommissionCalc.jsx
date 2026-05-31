import { useEffect, useMemo, useRef, useState } from 'react'
import { useLang } from './i18n.jsx'

// Commission estimator shown inside an entity sheet. Anchored to the official
// pricing tiers: a monthly per-employee fee that steps down with headcount,
// plus a one-time setup fee that depends on Cloud vs On-Premise. The display
// shows 10% of the first-year deal value, with an animated counter.
const COMMISSION_RATE = 0.10

// Pricing tiers — see "Methodology of Pricing" reference doc.
const TIERS = [
  { min: 100,  max: 199,   monthly: 40, cloud: 50_000,  onprem: 90_000  },
  { min: 200,  max: 499,   monthly: 30, cloud: 70_000,  onprem: 100_000 },
  { min: 500,  max: 999,   monthly: 23, cloud: 90_000,  onprem: 150_000 },
  { min: 1000, max: 1999,  monthly: 18, cloud: 100_000, onprem: 200_000 },
  { min: 2000, max: 2999,  monthly: 14, cloud: 160_000, onprem: 300_000 },
  { min: 3000, max: 4999,  monthly: 11, cloud: 200_000, onprem: 350_000 },
  { min: 5000, max: 7999,  monthly: 8,  cloud: 300_000, onprem: 500_000 },
  { min: 8000, max: 14999, monthly: 6,  cloud: 400_000, onprem: 700_000 },
  { min: 15000, max: Infinity, monthly: 4, cloud: 500_000, onprem: 850_000 },
]

function tierFor(emp) {
  return TIERS.find((t) => emp >= t.min && emp <= t.max) || TIERS[0]
}

// experience-based touch per sector: government deals lean on-premise with a
// premium for regulatory/training overhead, semi-government leans cloud at
// baseline, and private deals are price-sensitive (light trim).
const SECTOR_PROFILE = {
  gov:     { deployment: 'onprem', factor: 1.10 },
  semi:    { deployment: 'cloud',  factor: 1.00 },
  private: { deployment: 'cloud',  factor: 0.90 },
}

function estimateCommission(emp, sector) {
  const tier = tierFor(emp)
  const profile = SECTOR_PROFILE[sector] || SECTOR_PROFILE.private
  const annual = emp * tier.monthly * 12
  const initial = profile.deployment === 'onprem' ? tier.onprem : tier.cloud
  const total = (annual + initial) * profile.factor
  // round to nearest 5k for a clean display
  return Math.round((total * COMMISSION_RATE) / 5000) * 5000
}

// approximate the entity's expected size as a nicely rounded slider default.
// Bigger headcount for ministries and PIF-flagship semi-government entities;
// smaller for private defaults. Both fields stay editable.
const BIG_NAMES = [
  'stc', 'سابك', 'معادن', 'أرامكو', 'نيوم', 'روشن', 'SEC', 'الكهرباء',
  'SNB', 'الأهلي', 'الرياض', 'الإنماء', 'أكوا باور', 'البحري', 'SAMI',
  'العقارية', 'السعودية للكهرباء', 'الراجحي', 'الإسكان الوطنية', 'NHC',
  'علم', 'هيومين', 'مرافق',
]
const SLIDER_MAX = 15000
function defaultEmployees(company) {
  if (!company) return 1000
  // prefer authoritative LinkedIn-sourced count when we have it
  if (company.employees && company.employees > 0) {
    return Math.max(100, Math.min(SLIDER_MAX, company.employees))
  }
  if (company.type === 'ministry') return 5000
  if (company.type === 'authority') return 2000
  const name = company.name || ''
  if (company.type === 'semi') {
    return BIG_NAMES.some((n) => name.includes(n)) ? 5000 : 1500
  }
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
  const [emp, setEmp] = useState(() => defaultEmployees(company))
  // reset to smart defaults whenever the open entity changes
  useEffect(() => {
    setSector(sectorFor(company))
    setEmp(defaultEmployees(company))
  }, [company?.id])

  const target = useMemo(() => estimateCommission(emp, sector), [emp, sector])
  const display = useAnimatedNumber(target)

  const fmt = (n) =>
    new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'ar-SA', { maximumFractionDigits: 0 }).format(n)
  const empLabel = emp >= SLIDER_MAX ? `${fmt(SLIDER_MAX)}+` : fmt(emp)

  return (
    <div className="sheet-section calc-block">
      <h4>{t('calcTitle')}</h4>
      <p className="calc-sub">{t('calcSub')}</p>

      <label className="calc-field">
        <span className="calc-label">{t('calcSector')}</span>
        <select className="calc-select" value={sector} onChange={(e) => setSector(e.target.value)}>
          <option value="gov">{t('calcGov')}</option>
          <option value="semi">{t('calcSemi')}</option>
          <option value="private">{t('calcPrivate')}</option>
        </select>
      </label>

      <label className="calc-field">
        <span className="calc-label">
          {t('calcSize')} <strong className="calc-emp">{empLabel}</strong>
        </span>
        <input
          type="range" min="100" max={SLIDER_MAX} step="50" value={emp}
          onChange={(e) => setEmp(Number(e.target.value))}
          className="calc-slider"
        />
        <span className="calc-range-ends">
          <span>100</span><span>{fmt(SLIDER_MAX)}+</span>
        </span>
      </label>

      <div className="calc-result">
        <span className="calc-result-label">{t('calcResultLabel')}</span>
        <span className="calc-result-value">{fmt(display)} <em>{t('calcCurrency')}</em></span>
      </div>
      <p className="calc-foot">{t('calcFoot')}</p>
    </div>
  )
}

// smooth count-up: drives the displayed number toward the latest target over
// ~450 ms whenever the target changes (slider/solution).
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
