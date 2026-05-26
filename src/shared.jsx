import { useEffect, useState } from 'react'

export const STATUS = {
  open: { label: 'متوفر', cls: 'open' },
  reserved: { label: 'محجوز', cls: 'reserved' },
  completed: { label: 'مكتمل', cls: 'completed' },
  // legacy fallback
  claimed: { label: 'محجوز', cls: 'reserved' },
}

export function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.open
  return <span className={`badge badge-${s.cls}`}>{s.label}</span>
}

// short display label for entities without a logo: drops the generic
// prefix (وزارة / الهيئة / شركة …) and keeps the distinctive part of the name
const NAME_PREFIXES = ['وزارة', 'الهيئة العامة', 'الهيئة السعودية', 'الهيئة', 'هيئة', 'الشركة', 'شركة', 'مؤسسة', 'بنك', 'مصرف', 'مجموعة', 'صندوق', 'مركز', 'منصة', 'نادي']
export function monogram(name) {
  if (!name) return '—'
  let s = name.replace(/\s*\([^)]*\)\s*/g, ' ').trim() // strip parenthetical
  for (const p of NAME_PREFIXES) {
    if (s.startsWith(p + ' ')) { s = s.slice(p.length).trim(); break }
  }
  const words = s.split(/\s+/).filter(Boolean)
  return words.slice(0, 2).join(' ') || name
}

export function fmtRemaining(ms) {
  if (ms <= 0) return 'انتهى الوقت'
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (d > 0) return `${d} يوم ${h} ساعة`
  if (h > 0) return `${h} ساعة ${m} دقيقة`
  return `${m} دقيقة`
}

// live countdown shown under a logo for reserved companies
export function Deadline({ deadline, status }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60000)
    return () => clearInterval(t)
  }, [])
  if (!deadline || (status !== 'reserved' && status !== 'open')) return null
  const remaining = deadline - Date.now()
  return (
    <div className={`deadline ${remaining <= 0 ? 'expired' : ''}`}>
      <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden>
        <path fill="currentColor" d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 11h-4v-2h2V7h2z" />
      </svg>
      {fmtRemaining(remaining)}
    </div>
  )
}
