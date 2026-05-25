import { useState } from 'react'
import { reserveCompany, getPhoneToken } from './api.js'
import { StatusBadge, Deadline } from './shared.jsx'

export default function CompanySheet({ company, onClose, onNeedLogin, onReserved }) {
  const [reservation, setReservation] = useState(null) // {contact_phone, premadeMessage, whatsappLink}
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
          <div className="reserved-block">
            <div className="reserved-ok">✓ تم تسجيل طلب الحجز — بانتظار موافقة الإدارة</div>
            <div className="sheet-section">
              <h4>رسالة واتساب جاهزة</h4>
              <p className="premade">{reservation.premadeMessage}</p>
            </div>
            {reservation.contact_phone ? (
              <>
                <div className="contact-row">
                  رقم التواصل: <strong dir="ltr">{reservation.contact_phone}</strong>
                </div>
                <a className="btn whatsapp full" href={reservation.whatsappLink} target="_blank" rel="noreferrer">
                  <WaIcon /> فتح المحادثة في واتساب
                </a>
              </>
            ) : (
              <div className="muted">سيتم تزويدك برقم التواصل بعد موافقة الإدارة.</div>
            )}
          </div>
        )}
      </div>
    </div>
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
