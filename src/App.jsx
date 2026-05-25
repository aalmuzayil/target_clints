import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  listCompanies,
  listCategories,
  myCompanies,
  submitCompany,
  getPhoneNumber,
  getPhoneName,
  getPhoneToken,
  clearPhoneSession,
} from './api.js'
import { StatusBadge, Deadline } from './shared.jsx'
import PhoneLogin from './PhoneLogin.jsx'
import CompanySheet from './CompanySheet.jsx'

export default function App() {
  const [companies, setCompanies] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState('')
  const [view, setView] = useState('all') // all | mine
  const [phone, setPhone] = useState(getPhoneNumber())
  const [name, setName] = useState(getPhoneName())
  const [showLogin, setShowLogin] = useState(false)
  const [selected, setSelected] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [mine, setMine] = useState([])

  function loadAll() {
    setLoading(true)
    Promise.all([listCompanies(), listCategories()])
      .then(([c, cats]) => {
        setCompanies(c)
        setCategories(cats)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(loadAll, [])

  function loadMine() {
    if (getPhoneToken()) myCompanies().then(setMine).catch(() => setMine([]))
  }
  useEffect(() => {
    if (view === 'mine') loadMine()
  }, [view, phone])

  const source = view === 'mine' ? mine : companies
  const filtered = useMemo(() => {
    const q = query.trim()
    return source.filter(
      (c) =>
        (!cat || c.category === cat) &&
        (!q || c.name.includes(q) || (c.short || '').includes(q)),
    )
  }, [source, query, cat])

  function onLogin(p) {
    setPhone(p)
    setName(getPhoneName())
    setShowLogin(false)
    loadMine()
  }
  function logout() {
    clearPhoneSession()
    setPhone(null)
    setName('')
    setView('all')
  }

  return (
    <div className="app">
      <Header phone={phone} name={name} onLogin={() => setShowLogin(true)} onLogout={logout} />

      <section className="hero">
        <div className="container">
          <h1>دليل الشركات</h1>
          <p>تصفّح الشركات المتاحة، واحجز ما يناسبك مباشرة عبر أكثم</p>
        </div>
      </section>

      <main className="container main">
        {/* search */}
        <div className="searchbar">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 10-.7.7l.27.28v.79l5 4.99L20.49 19zm-6 0A4.5 4.5 0 1114 9.5 4.5 4.5 0 019.5 14z" />
          </svg>
          <input
            type="search"
            placeholder="ابحث عن شركة"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* view toggle */}
        {phone && (
          <div className="view-toggle">
            <button className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>
              كل الشركات
            </button>
            <button className={view === 'mine' ? 'active' : ''} onClick={() => setView('mine')}>
              قائمتي
            </button>
          </div>
        )}

        {/* category chips */}
        {view === 'all' && (
          <div className="chips">
            <button className={!cat ? 'chip active' : 'chip'} onClick={() => setCat('')}>
              الكل
            </button>
            {categories.map((c) => (
              <button key={c} className={cat === c ? 'chip active' : 'chip'} onClick={() => setCat(c)}>
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="list-head">
          <span className="count">{loading ? 'جارٍ التحميل…' : `${filtered.length} شركة`}</span>
          <button className="btn small primary" onClick={() => (getPhoneToken() ? setShowAdd(true) : setShowLogin(true))}>
            + إضافة شركتي
          </button>
        </div>

        {loading ? null : filtered.length === 0 ? (
          <div className="empty">
            {view === 'mine' ? 'لا توجد شركات في قائمتك بعد.' : 'لا توجد نتائج.'}
          </div>
        ) : (
          <div className="grid">
            {filtered.map((c) => (
              <button key={c.id} className="card" onClick={() => setSelected(c)}>
                <div className="card-logo">
                  {c.logo ? <img src={c.logo} alt="" loading="lazy" /> : <span>{c.short || '—'}</span>}
                </div>
                <Deadline deadline={c.reserve_deadline} status={c.status} />
                <h3>{c.name}</h3>
                <div className="card-foot">
                  <StatusBadge status={c.status} />
                  {c.category ? <span className="chip-sm">{c.category}</span> : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      <Footer />

      {showLogin && <PhoneLogin onClose={() => setShowLogin(false)} onSuccess={onLogin} />}
      {selected && (
        <CompanySheet
          company={selected}
          onClose={() => setSelected(null)}
          onNeedLogin={() => {
            setSelected(null)
            setShowLogin(true)
          }}
          onReserved={() => {
            loadAll()
            loadMine()
          }}
        />
      )}
      {showAdd && (
        <AddCompany
          onClose={() => setShowAdd(false)}
          onDone={() => {
            setShowAdd(false)
          }}
        />
      )}
    </div>
  )
}

function Header({ phone, name, onLogin, onLogout }) {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <a className="brand" href="/">
          <img className="brand-logo" src="/aktham-logo.svg" alt="أكثم" />
        </a>
        {phone ? (
          <div className="account">
            <span className="acc-phone" dir={name ? 'rtl' : 'ltr'}>{name || phone}</span>
            <button className="btn ghost small" onClick={onLogout}>خروج</button>
          </div>
        ) : (
          <button className="btn primary small" onClick={onLogin}>
            تسجيل الدخول
          </button>
        )}
      </div>
    </header>
  )
}

function AddCompany({ onClose, onDone }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await submitCompany(name, category)
      setDone(true)
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
        {done ? (
          <div className="reserved-block">
            <div className="reserved-ok">✓ تم إرسال شركتك</div>
            <p className="muted">
              ستظهر شركتك في القائمة بعد موافقة الإدارة. إذا لم يحجزها أحد، سنعود إليك.
            </p>
            <button className="btn primary full" onClick={onDone}>تم</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h3>إضافة شركتي</h3>
            <p className="muted">إذا لم تجد شركتك في القائمة، أضِف اسمها وسنراجعها.</p>
            <label>
              اسم الشركة *
              <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </label>
            <label>
              التصنيف (اختياري)
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="مثال: تقنية" />
            </label>
            {error && <div className="form-error">{error}</div>}
            <button className="btn primary full" disabled={busy}>
              {busy ? '...' : 'إرسال'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <img className="brand-logo-white" src="/aktham-logo-white.svg" alt="أكثم" />
        <div className="footer-links">
          <span>© {new Date().getFullYear()} أكثم — جميع الحقوق محفوظة</span>
          <Link to="/admin" className="admin-link">لوحة التحكم</Link>
        </div>
      </div>
    </footer>
  )
}
