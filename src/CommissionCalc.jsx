import { useEffect, useMemo, useRef, useState } from 'react'
import { useLang } from './i18n.jsx'

// Smart estimator for the "door-opening" commission, shown in the entity sheet.
// The deal value scales with expected entity size (employee count) and the
// sector picks up a credibility multiplier. Commission is a fixed 15% of the
// estimated deal value — visualised with an animated counter.
const COMMISSION_RATE = 0.15

// Piecewise base deal value (SAR), keyed off employee count.
// Tuned so 100 → 200k, 500 → 600k, 1000 → 1m, 2000 → 1.8m, 5000 → 4m, 5000+ → 5m.
function estimateBase(emp) {
  if (emp >= 5000) return 5_000_000
  if (emp >= 2000) return 1_800_000 + ((emp - 2000) / 3000) * (4_000_000 - 1_800_000)
  if (emp >= 1000) return 1_000_000 + ((emp - 1000) / 1000) * (1_800_000 - 1_000_000)
  if (emp >= 500) return 600_000 + ((emp - 500) / 500) * (1_000_000 - 600_000)
  if (emp >= 100) return 200_000 + ((emp - 100) / 400) * (600_000 - 200_000)
  return 200_000
}

const SECTOR_MULT = { gov: 1.5, semi: 1.3, private: 1.0 }

function estimateCommission(emp, sector) {
  const base = estimateBase(emp)
  const mult = SECTOR_MULT[sector] ?? 1
  const raw = base * mult * COMMISSION_RATE
  // round to nearest 5,000 for a clean display
  return Math.round(raw / 5000) * 5000
}

// derive a sane initial sector from the entity's tier
function sectorFor(company) {
  if (!company) return 'private'
  if (company.type === 'ministry' || company.type === 'authority') return 'gov'
  if (company.type === 'semi') return 'semi'
  return 'private'
}

// approximate the entity's expected size as a nicely rounded slider default.
// Bigger headcount for ministries and PIF-flagship semi-government entities;
// smaller for private/Tadawul defaults. Both fields stay editable.
const BIG_NAMES = [
  'stc', 'سابك', 'معادن', 'أرامكو', 'نيوم', 'روشن', 'SEC', 'الكهرباء',
  'SNB', 'الأهلي', 'الرياض', 'الإنماء', 'أكوا باور', 'البحري', 'SAMI',
  'العقارية', 'السعودية للكهرباء', 'الراجحي', 'الإسكان الوطنية', 'NHC',
  'علم', 'هيومين', 'مرافق',
]
function defaultEmployees(company) {
  if (!company) return 1000
  if (company.type === 'ministry') return 5000
  if (company.type === 'authority') return 2000
  const name = company.name || ''
  if (company.type === 'semi') {
    return BIG_NAMES.some((n) => name.includes(n)) ? 5000 : 1500
  }
  return BIG_NAMES.some((n) => name.includes(n)) ? 3000 : 500
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
        <span className="calc-label">{t('calcSize')} <strong className="calc-emp">{fmt(emp)}{emp >= 5000 ? '+' : ''}</strong></span>
        <input
          type="range" min="100" max="5000" step="50" value={emp}
          onChange={(e) => setEmp(Number(e.target.value))}
          className="calc-slider"
        />
        <span className="calc-range-ends">
          <span>100</span><span>5,000+</span>
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
// ~450 ms whenever the target changes (slider/sector).
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
      // easeOutCubic for a soft landing
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
