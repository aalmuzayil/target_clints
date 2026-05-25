import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  adminLogin,
  getAdminToken,
  setAdminToken,
  clearAdminToken,
  adminListCompanies,
  adminPending,
  adminCreate,
  adminUpdate,
  adminDelete,
  adminApproveCompany,
  adminSetStatus,
  adminSetDeadline,
  adminAssign,
  adminUnassign,
  adminAssignments,
  adminReservations,
  adminApproveReservation,
  adminRejectReservation,
  adminTemplates,
  adminCreateTemplate,
  adminDeleteTemplate,
} from './api.js'
import { STATUS, StatusBadge } from './shared.jsx'

export default function Admin() {
  const [authed, setAuthed] = useState(!!getAdminToken())
  if (!authed) return <Login onSuccess={() => setAuthed(true)} />
  return <Dashboard onLogout={() => setAuthed(false)} />
}

function Login({ onSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      const { token } = await adminLogin(email, password)
      setAdminToken(token); onSuccess()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <div className="admin-auth">
      <form className="auth-card" onSubmit={submit}>
        <img className="brand-logo" src="/aktham-logo.svg" alt="أكثم" />
        <h1>لوحة التحكم</h1>
        <label>البريد الإلكتروني
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        <label>كلمة المرور
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="btn primary full" disabled={busy}>{busy ? '...' : 'دخول'}</button>
        <Link to="/" className="muted back-link">← العودة للموقع</Link>
      </form>
    </div>
  )
}

function Dashboard({ onLogout }) {
  const [tab, setTab] = useState('companies')
  const [error, setError] = useState('')
  function logout() { clearAdminToken(); onLogout() }
  return (
    <div className="admin-shell">
      <header className="admin-bar">
        <img className="brand-logo" src="/aktham-logo.svg" alt="أكثم" />
        <div className="admin-actions">
          <Link to="/" className="btn ghost small">الموقع</Link>
          <button className="btn ghost small" onClick={logout}>خروج</button>
        </div>
      </header>
      <main className="container admin-main">
        <div className="tabs">
          <button className={tab === 'companies' ? 'active' : ''} onClick={() => setTab('companies')}>الشركات</button>
          <button className={tab === 'reservations' ? 'active' : ''} onClick={() => setTab('reservations')}>طلبات الحجز</button>
          <button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>شركات بانتظار الموافقة</button>
          <button className={tab === 'templates' ? 'active' : ''} onClick={() => setTab('templates')}>رسائل واتساب</button>
        </div>
        {error && <div className="form-error">{error}</div>}
        {tab === 'companies' && <Companies onError={setError} />}
        {tab === 'reservations' && <Reservations onError={setError} />}
        {tab === 'pending' && <Pending onError={setError} />}
        {tab === 'templates' && <Templates onError={setError} />}
      </main>
    </div>
  )
}

const EMPTY = { name: '', short: '', url: '', category: '', profile: '', contact_phone: '', status: 'open', logo: '' }

function Companies({ onError }) {
  const [list, setList] = useState([])
  const [editing, setEditing] = useState(null)
  function load() { adminListCompanies().then(setList).catch((e) => onError(e.message)) }
  useEffect(load, [])

  async function remove(c) {
    if (!confirm(`حذف "${c.name}"؟`)) return
    try { await adminDelete(c.id); load() } catch (e) { onError(e.message) }
  }
  return (
    <>
      <div className="admin-head">
        <h2>الشركات ({list.length})</h2>
        <button className="btn primary small" onClick={() => setEditing({ ...EMPTY })}>+ إضافة</button>
      </div>
      <div className="rows">
        {list.map((c) => (
          <div className="row" key={c.id}>
            {c.logo ? <img className="row-logo" src={c.logo} alt="" /> : <div className="row-logo" />}
            <div className="row-main">
              <strong>{c.name}</strong>
              <div className="row-sub">
                <StatusBadge status={c.status} />
                {c.category ? <span>· {c.category}</span> : null}
                {c.reserved_by ? <span dir="ltr">· {c.reserved_by}</span> : null}
              </div>
            </div>
            <div className="row-actions">
              <button className="btn ghost" onClick={() => setEditing(c)}>تعديل</button>
              <button className="btn danger" onClick={() => remove(c)}>حذف</button>
            </div>
          </div>
        ))}
      </div>
      {editing && <EditModal company={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} onError={onError} />}
    </>
  )
}

function EditModal({ company, onClose, onSaved, onError }) {
  const isNew = !company.id
  const [form, setForm] = useState({
    name: company.name || '', short: company.short || '', url: company.url && company.url !== '#' ? company.url : '',
    category: company.category || '', profile: company.profile || '', contact_phone: company.contact_phone || '',
    status: company.status || 'open',
  })
  const [file, setFile] = useState(null)
  const [deadlineLocal, setDeadlineLocal] = useState(
    company.reserve_deadline ? new Date(company.reserve_deadline).toISOString().slice(0, 16) : '',
  )
  const [assignments, setAssignments] = useState([])
  const [assignPhone, setAssignPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => { if (!isNew) adminAssignments(company.id).then(setAssignments).catch(() => {}) }, [])

  async function addAssign() {
    if (!assignPhone.trim()) return
    try { await adminAssign(company.id, assignPhone); setAssignPhone(''); setAssignments(await adminAssignments(company.id)) }
    catch (e) { onError(e.message) }
  }
  async function removeAssign(p) {
    try { await adminUnassign(company.id, p); setAssignments(await adminAssignments(company.id)) } catch (e) { onError(e.message) }
  }

  async function submit(e) {
    e.preventDefault(); setBusy(true); onError('')
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => fd.append(k, v))
      if (file) fd.append('logoFile', file)
      const saved = isNew ? await adminCreate(fd) : await adminUpdate(company.id, fd)
      const id = saved.id || company.id
      // deadline (only meaningful for existing rows; apply after save)
      const dl = deadlineLocal ? new Date(deadlineLocal).getTime() : null
      await adminSetDeadline(id, dl)
      onSaved()
    } catch (err) { onError(err.message); setBusy(false) }
  }

  const preview = file ? URL.createObjectURL(file) : form.logo || company.logo
  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>{isNew ? 'إضافة شركة' : 'تعديل شركة'}</h3>
        <label>اسم الشركة *<input value={form.name} onChange={set('name')} required /></label>
        <div className="field-row">
          <label>اسم مختصر<input value={form.short} onChange={set('short')} /></label>
          <label>التصنيف<input value={form.category} onChange={set('category')} /></label>
        </div>
        <label>رابط الموقع<input value={form.url} onChange={set('url')} placeholder="https://" /></label>
        <label>رقم التواصل (واتساب)<input dir="ltr" value={form.contact_phone} onChange={set('contact_phone')} placeholder="9665XXXXXXXX" /></label>
        <label>نبذة عن الشركة<textarea value={form.profile} onChange={set('profile')} /></label>
        <label>الحالة
          <div className="seg">
            {Object.entries(STATUS).map(([k, v]) => (
              <button type="button" key={k} className={form.status === k ? 'active' : ''} onClick={() => setForm((f) => ({ ...f, status: k }))}>{v.label}</button>
            ))}
          </div>
        </label>
        <label>وقت انتهاء الحجز<input type="datetime-local" value={deadlineLocal} onChange={(e) => setDeadlineLocal(e.target.value)} /></label>
        <label>الشعار<input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0] || null)} /></label>
        {preview ? <div className="logo-preview"><img src={preview} alt="" /></div> : null}

        {!isNew && (
          <label>ربط بأرقام جوال (تظهر لهم في قائمتهم)
            <div className="seg" style={{ marginBottom: 6 }}>
              {assignments.map((p) => (
                <button type="button" key={p} className="active" onClick={() => removeAssign(p)} dir="ltr">{p} ✕</button>
              ))}
            </div>
            <div className="field-row">
              <input dir="ltr" value={assignPhone} onChange={(e) => setAssignPhone(e.target.value)} placeholder="05XXXXXXXX" />
              <button type="button" className="btn ghost" onClick={addAssign}>ربط</button>
            </div>
          </label>
        )}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          <button className="btn primary" disabled={busy}>{busy ? '...' : 'حفظ'}</button>
        </div>
      </form>
    </div>
  )
}

function Reservations({ onError }) {
  const [list, setList] = useState([])
  function load() { adminReservations('pending').then(setList).catch((e) => onError(e.message)) }
  useEffect(load, [])
  async function approve(r) {
    try { const res = await adminApproveReservation(r.id); if (res.notifyWhatsappLink) window.open(res.notifyWhatsappLink, '_blank'); load() }
    catch (e) { onError(e.message) }
  }
  async function reject(r) {
    try { await adminRejectReservation(r.id); load() } catch (e) { onError(e.message) }
  }
  return (
    <>
      <div className="admin-head"><h2>طلبات الحجز ({list.length})</h2></div>
      {list.length === 0 ? <div className="empty">لا توجد طلبات معلّقة.</div> : (
        <div className="rows">
          {list.map((r) => (
            <div className="row" key={r.id}>
              {r.company_logo ? <img className="row-logo" src={r.company_logo} alt="" /> : <div className="row-logo" />}
              <div className="row-main">
                <strong>{r.company_name}</strong>
                <div className="row-sub"><span dir="ltr">{r.phone}</span><span>· {new Date(r.created_at).toLocaleDateString('ar')}</span></div>
              </div>
              <div className="row-actions">
                <button className="btn primary" onClick={() => approve(r)}>قبول + واتساب</button>
                <button className="btn danger" onClick={() => reject(r)}>رفض</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function Pending({ onError }) {
  const [list, setList] = useState([])
  function load() { adminPending().then(setList).catch((e) => onError(e.message)) }
  useEffect(load, [])
  async function approve(c) {
    try { const res = await adminApproveCompany(c.id); if (res.verifyWhatsappLink) window.open(res.verifyWhatsappLink, '_blank'); load() }
    catch (e) { onError(e.message) }
  }
  async function remove(c) {
    if (!confirm(`رفض وحذف "${c.name}"؟`)) return
    try { await adminDelete(c.id); load() } catch (e) { onError(e.message) }
  }
  return (
    <>
      <div className="admin-head"><h2>بانتظار الموافقة ({list.length})</h2></div>
      {list.length === 0 ? <div className="empty">لا توجد شركات مضافة من المستخدمين.</div> : (
        <div className="rows">
          {list.map((c) => (
            <div className="row" key={c.id}>
              <div className="row-main">
                <strong>{c.name}</strong>
                <div className="row-sub"><span>أضافها:</span><span dir="ltr">{c.submitted_by}</span>{c.category ? <span>· {c.category}</span> : null}</div>
              </div>
              <div className="row-actions">
                <button className="btn primary" onClick={() => approve(c)}>موافقة + تحقق واتساب</button>
                <button className="btn danger" onClick={() => remove(c)}>رفض</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function Templates({ onError }) {
  const [list, setList] = useState([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [phone, setPhone] = useState('')
  function load() { adminTemplates().then(setList).catch((e) => onError(e.message)) }
  useEffect(load, [])
  async function add(e) {
    e.preventDefault()
    try { await adminCreateTemplate(title, body); setTitle(''); setBody(''); load() } catch (err) { onError(err.message) }
  }
  async function del(t) { try { await adminDeleteTemplate(t.id); load() } catch (e) { onError(e.message) } }
  function sendVia(t) {
    const digits = phone.replace(/\D/g, '')
    if (!digits) { onError('أدخل رقم الجوال أولاً'); return }
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(t.body)}`, '_blank')
  }
  return (
    <>
      <div className="admin-head"><h2>رسائل واتساب الجاهزة</h2></div>
      <form className="rows" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }} onSubmit={add}>
        <input placeholder="عنوان القالب" value={title} onChange={(e) => setTitle(e.target.value)} required style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 11, fontFamily: 'inherit' }} />
        <textarea placeholder="نص الرسالة" value={body} onChange={(e) => setBody(e.target.value)} required style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 11, minHeight: 70, fontFamily: 'inherit' }} />
        <button className="btn primary">إضافة قالب</button>
      </form>
      <div className="rows" style={{ padding: 12, marginBottom: 16 }}>
        <label style={{ fontSize: 14, color: 'var(--ink-soft)' }}>إرسال إلى رقم
          <input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05XXXXXXXX" style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 10, padding: 11, marginTop: 6, fontFamily: 'inherit' }} />
        </label>
      </div>
      {list.length === 0 ? <div className="empty">لا توجد قوالب.</div> : (
        <div className="rows">
          {list.map((t) => (
            <div className="row" key={t.id}>
              <div className="row-main">
                <strong>{t.title}</strong>
                <div className="row-sub">{t.body}</div>
              </div>
              <div className="row-actions">
                <button className="btn primary" onClick={() => sendVia(t)}>إرسال واتساب</button>
                <button className="btn danger" onClick={() => del(t)}>حذف</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
