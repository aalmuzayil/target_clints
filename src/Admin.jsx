import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  listAgencies,
  login,
  createAgency,
  updateAgency,
  deleteAgency,
  getToken,
  setToken,
  clearToken,
} from './api.js'

export default function Admin() {
  const [authed, setAuthed] = useState(!!getToken())

  if (!authed) return <LoginScreen onSuccess={() => setAuthed(true)} />
  return <Dashboard onLogout={() => setAuthed(false)} />
}

function LoginScreen({ onSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { token } = await login(email, password)
      setToken(token)
      onSuccess()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-auth">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand-mark">SA</div>
        <h1>لوحة التحكم</h1>
        <p className="muted">سجّل الدخول لإدارة قائمة الجهات</p>
        <label>
          البريد الإلكتروني
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          كلمة المرور
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="btn primary" disabled={busy}>
          {busy ? '...' : 'دخول'}
        </button>
        <Link to="/" className="muted back-link">
          ← العودة للموقع
        </Link>
      </form>
    </div>
  )
}

const EMPTY = { name: '', short: '', url: '', logo: '' }

function Dashboard({ onLogout }) {
  const [agencies, setAgencies] = useState([])
  const [editing, setEditing] = useState(null) // agency object or {} for new
  const [error, setError] = useState('')

  function load() {
    listAgencies()
      .then(setAgencies)
      .catch((e) => setError(e.message))
  }
  useEffect(load, [])

  function logout() {
    clearToken()
    onLogout()
  }

  async function remove(a) {
    if (!confirm(`حذف "${a.name}"؟`)) return
    try {
      await deleteAgency(a.id)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="admin-shell">
      <header className="admin-bar">
        <div className="brand">
          <div className="brand-mark">SA</div>
          <strong>إدارة الجهات الحكومية</strong>
        </div>
        <div className="admin-actions">
          <Link to="/" className="btn ghost">
            عرض الموقع
          </Link>
          <button className="btn ghost" onClick={logout}>
            تسجيل الخروج
          </button>
        </div>
      </header>

      <main className="container admin-main">
        <div className="admin-head">
          <h2>الجهات ({agencies.length})</h2>
          <button className="btn primary" onClick={() => setEditing({ ...EMPTY })}>
            + إضافة جهة
          </button>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="admin-table">
          <div className="admin-row admin-row-head">
            <span>الشعار</span>
            <span>الاسم</span>
            <span>الرابط</span>
            <span>إجراءات</span>
          </div>
          {agencies.map((a) => (
            <div className="admin-row" key={a.id}>
              <span className="cell-logo">
                {a.logo ? <img src={a.logo} alt="" /> : <em className="muted">—</em>}
              </span>
              <span>
                <strong>{a.name}</strong>
                {a.short ? <div className="muted">{a.short}</div> : null}
              </span>
              <span className="cell-url muted">{a.url}</span>
              <span className="cell-actions">
                <button className="btn ghost" onClick={() => setEditing(a)}>
                  تعديل
                </button>
                <button className="btn danger" onClick={() => remove(a)}>
                  حذف
                </button>
              </span>
            </div>
          ))}
        </div>
      </main>

      {editing && (
        <EditDialog
          agency={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
          onError={setError}
        />
      )}
    </div>
  )
}

function EditDialog({ agency, onClose, onSaved, onError }) {
  const isNew = !agency.id
  const [form, setForm] = useState({
    name: agency.name || '',
    short: agency.short || '',
    url: agency.url && agency.url !== '#' ? agency.url : '',
    logo: agency.logo || '',
  })
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)

  function set(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    onError('')
    try {
      const fd = new FormData()
      fd.append('name', form.name)
      fd.append('short', form.short)
      fd.append('url', form.url || '#')
      fd.append('logo', form.logo)
      if (file) fd.append('logoFile', file)
      if (isNew) await createAgency(fd)
      else await updateAgency(agency.id, fd)
      onSaved()
    } catch (err) {
      onError(err.message)
      setBusy(false)
    }
  }

  const preview = file ? URL.createObjectURL(file) : form.logo

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>{isNew ? 'إضافة جهة' : 'تعديل جهة'}</h3>
        <label>
          اسم الجهة *
          <input value={form.name} onChange={set('name')} required />
        </label>
        <label>
          اسم مختصر
          <input value={form.short} onChange={set('short')} />
        </label>
        <label>
          رابط الموقع
          <input value={form.url} onChange={set('url')} placeholder="https://example.gov.sa" />
        </label>
        <label>
          الشعار
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0] || null)} />
        </label>
        {preview ? (
          <div className="logo-preview">
            <img src={preview} alt="معاينة" />
          </div>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            إلغاء
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? '...' : 'حفظ'}
          </button>
        </div>
      </form>
    </div>
  )
}
