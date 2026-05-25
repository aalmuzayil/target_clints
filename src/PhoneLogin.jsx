import { useState } from 'react'
import { requestOtp, verifyOtp, setPhoneSession } from './api.js'

export default function PhoneLogin({ onClose, onSuccess }) {
  const [step, setStep] = useState('phone') // phone | code | pending
  const [name, setName] = useState('')
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
      const r = await requestOtp(phone, name)
      if (r.pending) {
        // number not on the allowlist: request sent to admin
        setStep('pending')
        return
      }
      if (r.skipVerify && r.token) {
        // no-verification mode: phone is just an identifier, log in immediately
        setPhoneSession(r.token, r.phone, r.name)
        onSuccess(r.phone)
        return
      }
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
      const r = await verifyOtp(phone, code, name)
      setPhoneSession(r.token, r.phone, r.name)
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
            <p className="muted">أدخل اسمك ورقم جوالك للمتابعة</p>
            <label>
              الاسم
              <input
                type="text"
                placeholder="اسمك"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </label>
            <label>
              رقم الجوال
              <input
                type="tel"
                inputMode="tel"
                dir="ltr"
                placeholder="05XXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </label>
            {error && <div className="form-error">{error}</div>}
            <button className="btn primary full" disabled={busy}>
              {busy ? '...' : 'متابعة'}
            </button>
          </form>
        ) : step === 'pending' ? (
          <div className="reserved-block">
            <h3>تم إرسال طلبك</h3>
            <div className="reserved-ok">✓ وصل رقمك إلى الإدارة</div>
            <p className="muted">
              رقمك <span dir="ltr">{phone}</span> غير مُفعّل بعد. سيتم تفعيله بعد موافقة الإدارة،
              وبعدها يمكنك تسجيل الدخول والاطلاع على قائمتك.
            </p>
            <button type="button" className="btn primary full" onClick={onClose}>
              حسناً
            </button>
          </div>
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
                maxLength={6}
                placeholder="______"
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
