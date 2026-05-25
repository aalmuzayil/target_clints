import { useState } from 'react'
import { requestOtp, verifyOtp, setPhoneSession } from './api.js'

export default function PhoneLogin({ onClose, onSuccess }) {
  const [step, setStep] = useState('phone') // phone | name | sent | code | welcome
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState('')
  const [welcomeName, setWelcomeName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function loginWith(r) {
    setPhoneSession(r.token, r.phone, r.name)
    setWelcomeName(r.name || '')
    setStep('welcome')
  }

  // step 1: number only
  async function submitPhone(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const r = await requestOtp(phone)
      if (r.skipVerify && r.token) return loginWith(r) // approved (no-verification mode)
      if (r.pending) return setStep('name') // not in list -> ask name next
      if (r.devCode) {
        setDevCode(r.devCode)
        setCode(r.devCode)
      }
      setStep('code') // approved + OTP mode
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // step 2 (only if not in list): capture name, send request to admin
  async function submitName(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await requestOtp(phone, name)
      setStep('sent')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function verify(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const r = await verifyOtp(phone, code)
      loginWith(r)
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

        {step === 'phone' && (
          <form onSubmit={submitPhone}>
            <h3>تسجيل الدخول</h3>
            <p className="muted">أدخل رقم جوالك للمتابعة</p>
            <label>
              رقم الجوال
              <input
                type="tel"
                inputMode="tel"
                dir="ltr"
                placeholder="05XXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoFocus
                required
              />
            </label>
            {error && <div className="form-error">{error}</div>}
            <button className="btn primary full" disabled={busy}>{busy ? '...' : 'متابعة'}</button>
          </form>
        )}

        {step === 'name' && (
          <form onSubmit={submitName}>
            <h3>رقمك غير مسجّل</h3>
            <p className="muted">أدخل اسمك وسنرسل طلبك للإدارة لتفعيل رقمك.</p>
            <label>
              الاسم
              <input type="text" placeholder="اسمك" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
            </label>
            <label>
              رقم الجوال
              <input type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </label>
            {error && <div className="form-error">{error}</div>}
            <button className="btn primary full" disabled={busy}>{busy ? '...' : 'إرسال الطلب'}</button>
            <button type="button" className="btn ghost full" onClick={() => setStep('phone')}>رجوع</button>
          </form>
        )}

        {step === 'sent' && (
          <div className="reserved-block">
            <h3>تم إرسال طلبك</h3>
            <div className="reserved-ok">✓ وصل طلبك إلى الإدارة</div>
            <p className="muted">
              سيتم تفعيل رقمك <span dir="ltr">{phone}</span> بعد موافقة الإدارة، وبعدها يمكنك الدخول.
            </p>
            <button type="button" className="btn primary full" onClick={onClose}>حسناً</button>
          </div>
        )}

        {step === 'code' && (
          <form onSubmit={verify}>
            <h3>رمز التحقق</h3>
            <p className="muted">أدخل الرمز المرسل إلى <span dir="ltr">{phone}</span></p>
            {devCode && (
              <div className="dev-hint">وضع التجربة — رمزك هو: <strong dir="ltr">{devCode}</strong></div>
            )}
            <label>
              الرمز
              <input type="text" inputMode="numeric" dir="ltr" maxLength={6} placeholder="______"
                value={code} onChange={(e) => setCode(e.target.value)} className="code-input" required />
            </label>
            {error && <div className="form-error">{error}</div>}
            <button className="btn primary full" disabled={busy}>{busy ? '...' : 'تأكيد ودخول'}</button>
            <button type="button" className="btn ghost full" onClick={() => setStep('phone')}>تغيير الرقم</button>
          </form>
        )}

        {step === 'welcome' && (
          <div className="welcome-block">
            <div className="welcome-emoji">👋</div>
            <h3>{welcomeName ? `حياك الله ${welcomeName}` : 'حياك الله'}</h3>
            <p className="muted">سعداء بعودتك إلى أكثم</p>
            <button type="button" className="btn primary full" onClick={() => onSuccess(phone)}>الدخول</button>
          </div>
        )}
      </div>
    </div>
  )
}
