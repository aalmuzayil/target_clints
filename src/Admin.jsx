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
  adminAccess,
  adminAddAccess,
  adminApproveAccess,
  adminRejectAccess,
  adminRemoveAccess,
  adminGetSettings,
  adminSaveIntro,
  adminSaveSettings,
  adminUploadDefaultProfile,
  adminCategoryProfiles,
  adminSetCategoryProfile,
  adminDeleteCategoryProfile,
  adminUserCompanies,
  adminAssignUser,
  adminUnassignUser,
  adminStats,
  listCompanies,
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
  const [tab, setTab] = useState('overview')
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
          <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>المتابعة</button>
          <button className={tab === 'companies' ? 'active' : ''} onClick={() => setTab('companies')}>الشركات</button>
          <button className={tab === 'reservations' ? 'active' : ''} onClick={() => setTab('reservations')}>طلبات الحجز</button>
          <button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>شركات بانتظار الموافقة</button>
          <button className={tab === 'access' ? 'active' : ''} onClick={() => setTab('access')}>المستخدمون</button>
          <button className={tab === 'templates' ? 'active' : ''} onClick={() => setTab('templates')}>رسائل واتساب</button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>الإعدادات</button>
        </div>
        {error && <div className="form-error">{error}</div>}
        {tab === 'overview' && <Overview onError={setError} />}
        {tab === 'companies' && <Companies onError={setError} />}
        {tab === 'reservations' && <Reservations onError={setError} />}
        {tab === 'pending' && <Pending onError={setError} />}
        {tab === 'access' && <Access onError={setError} />}
        {tab === 'templates' && <Templates onError={setError} />}
        {tab === 'settings' && <Settings onError={setError} />}
      </main>
    </div>
  )
}

const EMPTY = { name: '', short: '', url: '', category: '', profile: '', contact_phone: '', status: 'open', logo: '' }

const STATUS_LABEL = { open: 'متوفر', reserved: 'محجوز', completed: 'مكتمل' }
const TYPE_LABEL = { ministry: 'وزارات', authority: 'هيئات', company: 'شركات' }

function Overview({ onError }) {
  const [s, setS] = useState(null)
  useEffect(() => { adminStats().then(setS).catch((e) => onError(e.message)) }, [])
  if (!s) return <div className="empty">جارٍ التحميل…</div>

  const st = s.byStatus || {}
  const maxSector = Math.max(1, ...s.bySector.map((x) => x.count))
  const statusTotal = (st.open || 0) + (st.reserved || 0) + (st.completed || 0)

  return (
    <div className="overview">
      {/* KPI cards */}
      <div className="kpi-grid">
        <Kpi num={s.totals.entities} label="إجمالي الجهات" />
        <Kpi num={st.open || 0} label="متوفر" color="var(--green-3)" />
        <Kpi num={st.reserved || 0} label="محجوز" color="#b8860b" />
        <Kpi num={st.completed || 0} label="مكتمل" color="#1d6fc7" />
        <Kpi num={s.totals.users} label="مستخدمون مفعّلون" />
        <Kpi num={s.totals.pendingUsers} label="طلبات وصول" />
        <Kpi num={s.totals.reservations} label="طلبات الحجز" />
        <Kpi num={s.totals.pendingCompanies} label="بانتظار الموافقة" />
      </div>

      {/* status distribution bar */}
      <div className="panel">
        <h3>توزيع الحالات</h3>
        <div className="stackbar">
          {['open', 'reserved', 'completed'].map((k) => {
            const v = st[k] || 0
            const pct = statusTotal ? (v / statusTotal) * 100 : 0
            return v ? <div key={k} className={`seg-${k}`} style={{ width: `${pct}%` }} title={`${STATUS_LABEL[k]}: ${v}`}>{v}</div> : null
          })}
        </div>
        <div className="legend">
          <span><i className="dot seg-open" /> متوفر {st.open || 0}</span>
          <span><i className="dot seg-reserved" /> محجوز {st.reserved || 0}</span>
          <span><i className="dot seg-completed" /> مكتمل {st.completed || 0}</span>
        </div>
      </div>

      {/* by type */}
      <div className="panel">
        <h3>حسب النوع</h3>
        {Object.entries(s.byType).map(([k, v]) => (
          <div className="bar-row" key={k}>
            <span className="bar-label">{TYPE_LABEL[k] || k}</span>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${(v / s.totals.entities) * 100}%` }} /></div>
            <span className="bar-val">{v}</span>
          </div>
        ))}
      </div>

      {/* by sector */}
      {s.bySector.length > 0 && (
        <div className="panel">
          <h3>الشركات حسب القطاع</h3>
          {s.bySector.map((x) => (
            <div className="bar-row" key={x.sector}>
              <span className="bar-label">{x.sector}</span>
              <div className="bar-track"><div className="bar-fill alt" style={{ width: `${(x.count / maxSector) * 100}%` }} /></div>
              <span className="bar-val">{x.count}</span>
            </div>
          ))}
        </div>
      )}

      {/* recent reservations table */}
      <div className="panel">
        <h3>أحدث طلبات الحجز ({s.recent.length})</h3>
        {s.recent.length === 0 ? <div className="empty">لا توجد طلبات بعد.</div> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>الجهة</th><th>الطالب</th><th>رقم المعني</th><th>ملاحظة</th><th>الحالة</th><th>التاريخ</th></tr></thead>
              <tbody>
                {s.recent.map((r) => (
                  <tr key={r.id}>
                    <td>{r.company_name}</td>
                    <td>{r.requester_nick || r.requester_name || '—'}<br /><span className="muted" dir="ltr">{r.phone}</span></td>
                    <td dir="ltr">{r.lead_phone || '—'}</td>
                    <td>{r.comment || '—'}</td>
                    <td><span className={`badge badge-${r.status === 'approved' ? 'reserved' : r.status}`}>{r.status === 'pending' ? 'قيد المراجعة' : r.status === 'approved' ? 'مقبول' : r.status === 'rejected' ? 'مرفوض' : r.status}</span></td>
                    <td className="muted">{new Date(r.created_at).toLocaleDateString('ar')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Kpi({ num, label, color }) {
  return (
    <div className="kpi">
      <span className="kpi-num" style={color ? { color } : undefined}>{num}</span>
      <span className="kpi-label">{label}</span>
    </div>
  )
}

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
    status: company.status || 'open', type: company.type || 'company',
  })
  const TYPES = { ministry: 'وزارة', authority: 'هيئة', company: 'شركة' }
  const [file, setFile] = useState(null)
  const [profileFile, setProfileFile] = useState(null)
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
      if (profileFile) fd.append('profileFile', profileFile)
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
        <label>الاسم *<input value={form.name} onChange={set('name')} required /></label>
        <label>النوع
          <div className="seg">
            {Object.entries(TYPES).map(([k, v]) => (
              <button type="button" key={k} className={form.type === k ? 'active' : ''} onClick={() => setForm((f) => ({ ...f, type: k }))}>{v}</button>
            ))}
          </div>
        </label>
        <div className="field-row">
          <label>اسم مختصر<input value={form.short} onChange={set('short')} /></label>
          <label>{form.type === 'company' ? 'القطاع' : 'التصنيف'}<input value={form.category} onChange={set('category')} /></label>
        </div>
        <label>رابط الموقع<input value={form.url} onChange={set('url')} placeholder="https://" /></label>
        <label>رقم التواصل (واتساب)<input dir="ltr" value={form.contact_phone} onChange={set('contact_phone')} placeholder="9665XXXXXXXX" /></label>
        <label>نبذة عن الشركة<textarea value={form.profile} onChange={set('profile')} /></label>
        <label>الحالة
          <div className="seg">
            {['open', 'reserved', 'completed'].map((k) => (
              <button type="button" key={k} className={form.status === k ? 'active' : ''} onClick={() => setForm((f) => ({ ...f, status: k }))}>{STATUS[k].label}</button>
            ))}
          </div>
        </label>
        <label>وقت انتهاء الحجز<input type="datetime-local" value={deadlineLocal} onChange={(e) => setDeadlineLocal(e.target.value)} /></label>
        <label>الشعار<input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0] || null)} /></label>
        {preview ? <div className="logo-preview"><img src={preview} alt="" /></div> : null}
        <label>الملف التعريفي (PDF)
          <input type="file" accept=".pdf,application/pdf,image/*" onChange={(e) => setProfileFile(e.target.files[0] || null)} />
          {company.profile_file && !profileFile ? (
            <a href={company.profile_file} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 13, marginTop: 4 }}>الملف الحالي ↗</a>
          ) : null}
        </label>

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
    try { await adminApproveReservation(r.id); load() }
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
                <div className="row-sub">
                  <span>الطالب: {r.requester_name || '—'}</span><span dir="ltr">{r.phone}</span>
                  <span>· {new Date(r.created_at).toLocaleDateString('ar')}</span>
                </div>
                {r.lead_phone ? (
                  <div className="row-sub">
                    <span>الشخص المعني:</span>
                    <a href={`https://wa.me/${r.lead_phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" dir="ltr" style={{ color: 'var(--wa)', fontWeight: 700 }}>{r.lead_phone} ↗</a>
                  </div>
                ) : null}
              </div>
              <div className="row-actions">
                <button className="btn primary" onClick={() => approve(r)}>قبول</button>
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
    try { await adminApproveCompany(c.id); load() }
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
                <button className="btn primary" onClick={() => approve(c)}>موافقة</button>
                <button className="btn danger" onClick={() => remove(c)}>رفض</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function Access({ onError }) {
  const [pending, setPending] = useState([])
  const [approved, setApproved] = useState([])
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [assignUser, setAssignUser] = useState(null)

  function load() {
    adminAccess('pending').then(setPending).catch((e) => onError(e.message))
    adminAccess('approved').then(setApproved).catch((e) => onError(e.message))
  }
  useEffect(load, [])

  async function add(e) {
    e.preventDefault()
    const p = phone.replace(/\D/g, '')
    if (!p) return
    try { await adminAddAccess(p, name, nickname); setPhone(''); setName(''); setNickname(''); load() } catch (err) { onError(err.message) }
  }
  async function rename(u) {
    const newName = prompt('الاسم:', u.name || '')
    if (newName == null) return
    const newNick = prompt('الكنية (تظهر في الترحيب، مثال: أبو محمد):', u.nickname || '')
    try { await adminAddAccess(u.phone, newName.trim(), (newNick || '').trim()); load() } catch (e) { onError(e.message) }
  }
  async function approve(p) {
    try { await adminApproveAccess(p); load() }
    catch (e) { onError(e.message) }
  }
  async function reject(p) { try { await adminRejectAccess(p); load() } catch (e) { onError(e.message) } }
  async function remove(p) {
    if (!confirm(`إلغاء وصول الرقم ${p}؟`)) return
    try { await adminRemoveAccess(p); load() } catch (e) { onError(e.message) }
  }

  return (
    <>
      <div className="admin-head"><h2>طلبات الوصول ({pending.length})</h2></div>
      {pending.length === 0 ? (
        <div className="empty">لا توجد طلبات وصول جديدة.</div>
      ) : (
        <div className="rows">
          {pending.map((u) => (
            <div className="row" key={u.phone}>
              <div className="row-main">
                <strong>{u.name || '—'}</strong>
                <div className="row-sub"><span dir="ltr">{u.phone}</span><span>· طلب دخول</span></div>
              </div>
              <div className="row-actions">
                <button className="btn primary" onClick={() => approve(u.phone)}>قبول</button>
                <button className="btn danger" onClick={() => reject(u.phone)}>رفض</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="admin-head" style={{ marginTop: 24 }}><h2>الأرقام المصرّح لها ({approved.length})</h2></div>
      <form className="rows" style={{ padding: 14, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }} onSubmit={add}>
        <div className="field-row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم"
            style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 11, fontFamily: 'inherit' }} />
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="الكنية (أبو محمد)"
            style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 11, fontFamily: 'inherit' }} />
        </div>
        <div className="field-row">
          <input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05XXXXXXXX"
            style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 11, fontFamily: 'inherit' }} />
          <button className="btn primary">إضافة</button>
        </div>
      </form>
      {approved.length === 0 ? (
        <div className="empty">لم تتم إضافة أرقام بعد. أضِف أرقام المستخدمين المصرّح لهم.</div>
      ) : (
        <div className="rows">
          {approved.map((u) => (
            <div className="row" key={u.phone}>
              <div className="row-main">
                <strong>{u.nickname || u.name || '—'}</strong>
                <div className="row-sub">
                  {u.name && u.nickname ? <span>{u.name}</span> : null}
                  <span dir="ltr">{u.phone}</span>
                </div>
              </div>
              <div className="row-actions">
                <button className="btn ghost" onClick={() => setAssignUser(u)}>ربط جهات</button>
                <button className="btn ghost" onClick={() => rename(u)}>تعديل</button>
                <button className="btn danger" onClick={() => remove(u.phone)}>إلغاء</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {assignUser && (
        <AssignModal user={assignUser} onClose={() => setAssignUser(null)} onError={onError} />
      )}
    </>
  )
}

function AssignModal({ user, onClose, onError }) {
  const [companies, setCompanies] = useState([])
  const [assigned, setAssigned] = useState([]) // array of ids
  const [q, setQ] = useState('')
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    Promise.all([listCompanies(), adminUserCompanies(user.phone)])
      .then(([all, ids]) => { setCompanies(all); setAssigned(ids) })
      .catch((e) => onError(e.message))
  }, [user.phone])

  async function toggle(c) {
    setBusyId(c.id)
    try {
      if (assigned.includes(c.id)) { await adminUnassignUser(user.phone, c.id); setAssigned((a) => a.filter((x) => x !== c.id)) }
      else { await adminAssignUser(user.phone, c.id); setAssigned((a) => [...a, c.id]) }
    } catch (e) { onError(e.message) } finally { setBusyId(null) }
  }

  const filtered = companies.filter((c) => !q.trim() || c.name.includes(q.trim()))
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>ربط جهات بـ {user.nickname || user.name || user.phone}</h3>
        <input placeholder="ابحث عن جهة" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 11, fontFamily: 'inherit', width: '100%' }} />
        <div className="assign-list">
          {filtered.map((c) => {
            const on = assigned.includes(c.id)
            return (
              <button key={c.id} className={on ? 'assign-row on' : 'assign-row'} onClick={() => toggle(c)} disabled={busyId === c.id}>
                <span>{on ? '✓' : '+'}</span>
                <span className="assign-name">{c.name}</span>
                <StatusBadge status={c.status} />
              </button>
            )
          })}
        </div>
        <button className="btn primary full" onClick={onClose}>تم ({assigned.length} جهة)</button>
      </div>
    </div>
  )
}

function Settings({ onError }) {
  const [intro, setIntro] = useState('')
  const [approveTpl, setApproveTpl] = useState('')
  const [activateTpl, setActivateTpl] = useState('')
  const [defaultProfile, setDefaultProfile] = useState('')
  const [savedMsg, setSavedMsg] = useState('')
  const [cats, setCats] = useState([])
  const [catName, setCatName] = useState('')
  const [catFile, setCatFile] = useState(null)

  function load() {
    adminGetSettings().then((s) => {
      setIntro(s.intro_message || '')
      setApproveTpl(s.approve_template || '')
      setActivateTpl(s.activate_template || '')
      setDefaultProfile(s.default_profile_file || '')
    }).catch((e) => onError(e.message))
    adminCategoryProfiles().then(setCats).catch((e) => onError(e.message))
  }
  useEffect(load, [])

  function flash() { setSavedMsg('تم الحفظ ✓'); setTimeout(() => setSavedMsg(''), 1800) }
  async function saveIntro(e) {
    e.preventDefault()
    try { await adminSaveIntro(intro); flash() } catch (err) { onError(err.message) }
  }
  async function saveTemplates(e) {
    e.preventDefault()
    try { await adminSaveSettings({ approve_template: approveTpl, activate_template: activateTpl }); flash() } catch (err) { onError(err.message) }
  }
  async function uploadDefault(file) {
    if (!file) return
    try { const fd = new FormData(); fd.append('profileFile', file); const r = await adminUploadDefaultProfile(fd); setDefaultProfile(r.default_profile_file) } catch (e) { onError(e.message) }
  }
  async function addCat(e) {
    e.preventDefault()
    if (!catName.trim() || !catFile) { onError('أدخل اسم القطاع واختر ملفاً'); return }
    try { const fd = new FormData(); fd.append('category', catName.trim()); fd.append('profileFile', catFile); await adminSetCategoryProfile(fd); setCatName(''); setCatFile(null); load() } catch (err) { onError(err.message) }
  }
  async function delCat(c) { try { await adminDeleteCategoryProfile(c); load() } catch (e) { onError(e.message) } }

  const inputStyle = { border: '1px solid var(--line)', borderRadius: 10, padding: 11, fontFamily: 'inherit', width: '100%' }

  return (
    <>
      <div className="admin-head"><h2>رسالة التعريف بأكثم</h2></div>
      <form className="rows" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }} onSubmit={saveIntro}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>هذه الرسالة تظهر للمستخدم بعد الحجز (قابلة للنسخ والإرسال). يُضاف رابط الملف التعريفي تلقائياً.</p>
        <textarea value={intro} onChange={(e) => setIntro(e.target.value)} style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn primary">حفظ الرسالة</button>
          {savedMsg && <span style={{ color: 'var(--green-3)', fontSize: 14 }}>{savedMsg}</span>}
        </div>
      </form>

      <div className="admin-head"><h2>قوالب رسائل الواتساب</h2></div>
      <form className="rows" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }} onSubmit={saveTemplates}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>تُرسل من رقم الأدمن عند الموافقة. المتغيرات: {'{name}'} اسم المستخدم، {'{company}'} اسم الجهة.</p>
        <label style={{ fontSize: 14, color: 'var(--muted)' }}>قالب قبول الحجز
          <textarea value={approveTpl} onChange={(e) => setApproveTpl(e.target.value)} style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} />
        </label>
        <label style={{ fontSize: 14, color: 'var(--muted)' }}>قالب تفعيل المستخدم
          <textarea value={activateTpl} onChange={(e) => setActivateTpl(e.target.value)} style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} />
        </label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn primary">حفظ القوالب</button>
          {savedMsg && <span style={{ color: 'var(--green-3)', fontSize: 14 }}>{savedMsg}</span>}
        </div>
      </form>

      <div className="admin-head"><h2>الملف التعريفي الافتراضي</h2></div>
      <div className="rows" style={{ padding: 16, marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>يُستخدم لكل الشركات التي ليس لها ملف خاص أو ملف قطاع. تغييره هنا يغيّره لكل تلك الشركات.</p>
        {defaultProfile ? <a href={defaultProfile} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 13 }}>الملف الحالي ↗</a> : null}
        <input type="file" accept=".pdf,application/pdf,image/*" onChange={(e) => uploadDefault(e.target.files[0])} />
      </div>

      <div className="admin-head"><h2>ملفات حسب القطاع ({cats.length})</h2></div>
      <form className="rows" style={{ padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }} onSubmit={addCat}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>ملف لقطاع معيّن يُطبّق على كل شركات هذا القطاع (ما لم يكن للشركة ملف خاص).</p>
        <input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="اسم القطاع (مثال: تقنية)" style={inputStyle} />
        <input type="file" accept=".pdf,application/pdf,image/*" onChange={(e) => setCatFile(e.target.files[0] || null)} />
        <button className="btn primary">حفظ ملف القطاع</button>
      </form>
      {cats.length > 0 && (
        <div className="rows">
          {cats.map((c) => (
            <div className="row" key={c.category}>
              <div className="row-main">
                <strong>{c.category}</strong>
                <div className="row-sub"><a href={c.profile_file} target="_blank" rel="noreferrer">الملف ↗</a></div>
              </div>
              <div className="row-actions"><button className="btn danger" onClick={() => delCat(c.category)}>حذف</button></div>
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
