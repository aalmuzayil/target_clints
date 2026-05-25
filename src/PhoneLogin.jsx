import { useState } from 'react'
import { requestOtp, verifyOtp, setPhoneSession } from './api.js'

export default function PhoneLogin({ onClose, onSuccess }) {
  const [step, setStep] = useState('phone') // phone | code
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function send(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const r = await requestOtp(phone)
      if (r.devCode) {
        setDevCode(r.devCode)
        setCode(r.devCode) // prefill in dev mode for convenience
      }
      setStep('code')
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
      setPhoneSession(r.token, r.phone)
      onSuccess(r.phone)
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
        {step === 'phone' ? (
          <form onSubmit={send}>
            <h3>تسجيل الدخول</h3>
            <p className="muted">أدخل رقم جوالك وسنرسل لك رمز التحقق عبر واتساب</p>
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
            <button className="btn primary full" disabled={busy}>
              {busy ? '...' : 'إرسال الرمز'}
            </button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <h3>رمز التحقق</h3>
            <p className="muted">
              أدخل الرمز المرسل إلى <span dir="ltr">{phone}</span>
            </p>
            {devCode && (
              <div className="dev-hint">
                وضع التجربة — رمزك هو: <strong dir="ltr">{devCode}</strong>
              </div>
            )}
            <label>
              الرمز
              <input
                type="text"
                inputMode="numeric"
                dir="ltr"
                maxLength={4}
                placeholder="____"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="code-input"
                required
              />
            </label>
            {error && <div className="form-error">{error}</div>}
            <button className="btn primary full" disabled={busy}>
              {busy ? '...' : 'تأكيد ودخول'}
            </button>
            <button type="button" className="btn ghost full" onClick={() => setStep('phone')}>
              تغيير الرقم
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
