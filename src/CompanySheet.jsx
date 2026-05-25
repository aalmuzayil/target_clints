import { useState } from 'react'
import { reserveCompany, submitLead, submitComment, getPhoneToken } from './api.js'
import { StatusBadge, Deadline } from './shared.jsx'

const FALLBACK_INTRO =
  'مرحباً، أتواصل معكم عبر منصة أكثم — منصة تحليلات القوى العاملة ودعم القرار بالذكاء الاصطناعي.'
const DEFAULT_PROFILE = '/aktham-profile.pdf'

export default function CompanySheet({ company, onClose, onNeedLogin, onReserved }) {
  const [reservation, setReservation] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const canReserve = company.status === 'open'
  const statusWord = company.status === 'completed' ? 'مكتملة' : 'محجوزة'

  function startReserve() {
    if (!getPhoneToken()) return onNeedLogin()
    setError('')
    setConfirming(true)
  }

  async function confirmReserve() {
    setError('')
    setBusy(true)
    try {
      const r = await reserveCompany(company.id)
      setReservation(r)
      setConfirming(false)
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
            <h4>نبذة</h4>
            <p>{company.profile}</p>
          </div>
        ) : null}

        {company.url && company.url !== '#' ? (
          <a className="site-link" href={company.url} target="_blank" rel="noreferrer">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
              <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M10 14L21 3m0 0h-6m6 0v6M19 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6" />
            </svg>
            زيارة الموقع الرسمي
          </a>
        ) : null}

        {reservation ? (
          <ReservedOptions company={company} reservation={reservation} />
        ) : !canReserve ? (
          <div className="notice">
            <strong>هذه الجهة {statusWord} حالياً</strong>
            <span>لا يمكن حجزها في الوقت الحالي.</span>
          </div>
        ) : confirming ? (
          <div className="confirm-box">
            <strong>تأكيد حجز «{company.name}»؟</strong>
            <span>سيتم حجز الجهة باسمك.</span>
            {error && <div className="form-error">{error}</div>}
            <div className="confirm-actions">
              <button className="btn ghost" onClick={() => setConfirming(false)} disabled={busy}>إلغاء</button>
              <button className="btn primary" onClick={confirmReserve} disabled={busy}>{busy ? '...' : 'تأكيد'}</button>
            </div>
          </div>
        ) : (
          <>
            {error && <div className="form-error">{error}</div>}
            <button className="btn primary full" onClick={startReserve}>حجز هذه الجهة</button>
          </>
        )}
      </div>
    </div>
  )
}

function ReservedOptions({ company, reservation }) {
  const [picked, setPicked] = useState(null) // direct | onbehalf | other

  return (
    <div className="reserved-block">
      <div className="reserved-ok">✓ تم تأكيد حجز «{company.name}»</div>
      <p className="muted" style={{ textAlign: 'center', margin: '0 0 6px' }}>اختر طريقة المتابعة:</p>

      <button className={picked === 'direct' ? 'opt-card sel' : 'opt-card'} onClick={() => setPicked('direct')}>
        <OptIcon name="chat" />
        <div><strong>التواصل المباشر</strong><span>رسالة واتساب جاهزة للتواصل بنفسك</span></div>
      </button>
      {picked === 'direct' && <DirectContact company={company} reservation={reservation} />}

      <button className={picked === 'onbehalf' ? 'opt-card sel' : 'opt-card'} onClick={() => setPicked('onbehalf')}>
        <OptIcon name="call" />
        <div><strong>نتواصل عنك</strong><span>أعطنا رقم الشخص المعني وسيتواصل معه فريق أكثم</span></div>
      </button>
      {picked === 'onbehalf' && <OnBehalf companyId={company.id} />}

      <button className={picked === 'other' ? 'opt-card sel' : 'opt-card'} onClick={() => setPicked('other')}>
        <OptIcon name="note" />
        <div><strong>أخرى</strong><span>اكتب ملاحظة (اختياري)</span></div>
      </button>
      {picked === 'other' && <CommentBox companyId={company.id} />}
    </div>
  )
}

function DirectContact({ company, reservation }) {
  const [copied, setCopied] = useState(false)
  const profilePath = reservation.profile_file || DEFAULT_PROFILE
  const profileUrl = `${window.location.origin}${profilePath}`
  const intro = reservation.introMessage || FALLBACK_INTRO
  const shareText = `${intro}\n${profileUrl}`
  // contact the entity directly if we have its number, else open WhatsApp chooser
  const link = reservation.whatsappLink || `https://wa.me/?text=${encodeURIComponent(shareText)}`

  async function copy() {
    try { await navigator.clipboard.writeText(shareText); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch {}
  }
  return (
    <div className="msg-box">
      <div className="msg-head">
        <strong>رسالة جاهزة</strong>
        <button type="button" className="copy-btn" onClick={copy}>{copied ? 'تم النسخ ✓' : 'نسخ'}</button>
      </div>
      <p className="msg-text">{shareText}</p>
      <a className="btn whatsapp full" href={link} target="_blank" rel="noreferrer"><WaIcon /> فتح واتساب</a>
    </div>
  )
}

function OnBehalf({ companyId }) {
  const [phone, setPhone] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true)
    try { await submitLead(companyId, phone); setDone(true) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  if (done) return <div className="opt-panel success">✓ تم استلام الرقم، وسيتواصل فريق أكثم مع الشخص المعني قريباً.</div>
  return (
    <form className="opt-panel" onSubmit={submit}>
      <div className="opt-form-row">
        <input type="tel" inputMode="tel" dir="ltr" placeholder="رقم الشخص المعني 05XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        <button className="btn primary" disabled={busy}>{busy ? '...' : 'إرسال'}</button>
      </div>
      {error && <div className="form-error">{error}</div>}
    </form>
  )
}

function CommentBox({ companyId }) {
  const [text, setText] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true)
    try { await submitComment(companyId, text); setDone(true) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  if (done) return <div className="opt-panel success">✓ تم استلام ملاحظتك، شكراً لك.</div>
  return (
    <form className="opt-panel" onSubmit={submit}>
      <textarea placeholder="اكتب ملاحظتك (اختياري)" value={text} onChange={(e) => setText(e.target.value)} rows={3} />
      <button className="btn primary full" disabled={busy}>{busy ? '...' : 'إرسال الملاحظة'}</button>
      {error && <div className="form-error">{error}</div>}
    </form>
  )
}

function WaIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path fill="currentColor" d="M12 2a10 10 0 00-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1012 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8 0-1.3.7-2 .9-2.2.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.5c-.2.2-.3.4-.1.7.2.3.9 1.4 1.9 2 .8.5 1.4.7 1.6.6.2-.1.5-.6.7-.9.1-.2.3-.2.6-.1l1.9.9c.2.1.4.2.4.3.1.1.1.5-.1 1z" />
    </svg>
  )
}

function OptIcon({ name }) {
  const paths = {
    chat: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
    call: 'M6.6 10.8a15 15 0 006.6 6.6l2.2-2.2a1 1 0 011-.25 11 11 0 003.5.56 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11 11 0 00.56 3.5 1 1 0 01-.25 1z',
    note: 'M4 4h16v12l-4 4H4zM14 20v-4h4',
  }
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden className="opt-icon">
      <path d={paths[name]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
