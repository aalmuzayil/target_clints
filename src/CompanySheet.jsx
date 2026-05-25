import { useState } from 'react'
import { reserveCompany, submitLead, getPhoneToken } from './api.js'
import { StatusBadge, Deadline } from './shared.jsx'

const FALLBACK_INTRO =
  'مرحباً، أتواصل معكم عبر منصة أكثم — منصة تحليلات القوى العاملة ودعم القرار بالذكاء الاصطناعي.'
const DEFAULT_PROFILE = '/aktham-profile.pdf'

export default function CompanySheet({ company, onClose, onNeedLogin, onReserved }) {
  const [reservation, setReservation] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const canReserve = company.status === 'open' || company.status === 'reserved'

  async function reserve() {
    if (!getPhoneToken()) return onNeedLogin()
    setError('')
    setBusy(true)
    try {
      const r = await reserveCompany(company.id)
      setReservation(r)
      onReserved?.(r.company)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />

        <div className="sheet-head">
          <div className="sheet-logo">
            {company.logo ? <img src={company.logo} alt="" /> : <span>{company.short || '—'}</span>}
          </div>
          <div>
            <h3>{company.name}</h3>
            <div className="sheet-meta">
              <StatusBadge status={company.status} />
              {company.category ? <span className="chip-sm">{company.category}</span> : null}
            </div>
            <Deadline deadline={company.reserve_deadline} status={company.status} />
          </div>
        </div>

        {company.profile ? (
          <div className="sheet-section">
            <h4>نبذة عن الشركة</h4>
            <p>{company.profile}</p>
          </div>
        ) : null}

        {!reservation ? (
          <>
            {error && <div className="form-error">{error}</div>}
            {canReserve ? (
              <button className="btn primary full" onClick={reserve} disabled={busy}>
                {busy ? '...' : 'حجز هذه الشركة'}
              </button>
            ) : (
              <div className="unavailable">هذه الشركة غير متاحة للحجز حالياً</div>
            )}
          </>
        ) : (
          <ReservedOptions company={company} reservation={reservation} />
        )}
      </div>
    </div>
  )
}

function ReservedOptions({ company, reservation }) {
  const [copied, setCopied] = useState(false)
  // profile file: company-specific > category > global default (resolved by the server)
  const profilePath = reservation.profile_file || DEFAULT_PROFILE
  const profileUrl = `${window.location.origin}${profilePath}`

  // option 2: a forwardable message describing Aktham (admin-editable) + the profile link
  const intro = reservation.introMessage || FALLBACK_INTRO
  const shareText = `${intro}\n${profileUrl}`
  const shareLink = `https://wa.me/?text=${encodeURIComponent(shareText)}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard may be blocked; the text is visible to copy manually */
    }
  }

  return (
    <div className="reserved-block">
      <div className="reserved-ok">✓ تم تسجيل طلب الحجز — اختر الخطوة التالية</div>

      {/* 1) download the profile */}
      <a className="opt-card" href={profileUrl} target="_blank" rel="noreferrer" download>
        <OptIcon name="download" />
        <div>
          <strong>تحميل الملف التعريفي</strong>
          <span>احفظ الملف التعريفي على جهازك</span>
        </div>
      </a>

      {/* 2) copyable Aktham intro message + profile link */}
      <div className="msg-box">
        <div className="msg-head">
          <strong>رسالة تعريف بأكثم</strong>
          <button type="button" className="copy-btn" onClick={copy}>
            {copied ? 'تم النسخ ✓' : 'نسخ'}
          </button>
        </div>
        <p className="msg-text">{shareText}</p>
        <a className="btn whatsapp full" href={shareLink} target="_blank" rel="noreferrer">
          <WaIcon /> إرسال عبر واتساب
        </a>
      </div>

      {/* 3) give us the concerned person's number */}
      <LeadForm companyId={company.id} />
    </div>
  )
}

function LeadForm({ companyId }) {
  const [phone, setPhone] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await submitLead(companyId, phone)
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="opt-card success">
        <OptIcon name="check" />
        <div>
          <strong>تم استلام الرقم</strong>
          <span>سيتواصل فريق أكثم مع الشخص المعني قريباً</span>
        </div>
      </div>
    )
  }

  return (
    <form className="opt-card form" onSubmit={submit}>
      <div className="opt-form-head">
        <OptIcon name="call" />
        <div>
          <strong>زوّدنا برقم الشخص المعني</strong>
          <span>وسيتواصل فريق أكثم معه نيابةً عنك</span>
        </div>
      </div>
      <div className="opt-form-row">
        <input
          type="tel"
          inputMode="tel"
          dir="ltr"
          placeholder="05XXXXXXXX"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
        <button className="btn primary" disabled={busy}>{busy ? '...' : 'إرسال'}</button>
      </div>
      {error && <div className="form-error">{error}</div>}
    </form>
  )
}

function WaIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2a10 10 0 00-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1012 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8 0-1.3.7-2 .9-2.2.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.5c-.2.2-.3.4-.1.7.2.3.9 1.4 1.9 2 .8.5 1.4.7 1.6.6.2-.1.5-.6.7-.9.1-.2.3-.2.6-.1l1.9.9c.2.1.4.2.4.3.1.1.1.5-.1 1z"
      />
    </svg>
  )
}

function OptIcon({ name }) {
  const paths = {
    download: 'M12 3v10m0 0l-4-4m4 4l4-4M5 21h14',
    share: 'M18 8a3 3 0 10-2.8-4H15L9 7.6a3 3 0 100 4.8l6 3.6a3 3 0 102-2.6',
    call: 'M6.6 10.8a15 15 0 006.6 6.6l2.2-2.2a1 1 0 011-.25 11 11 0 003.5.56 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11 11 0 00.56 3.5 1 1 0 01-.25 1z',
    check: 'M20 6L9 17l-5-5',
  }
  const stroke = name === 'download' || name === 'check' || name === 'share'
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden className="opt-icon">
      <path
        d={paths[name]}
        fill={stroke ? 'none' : 'currentColor'}
        stroke={stroke ? 'currentColor' : 'none'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
