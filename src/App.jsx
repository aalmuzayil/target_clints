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
import { StatusBadge, Deadline, monogram } from './shared.jsx'
import PhoneLogin from './PhoneLogin.jsx'
import CompanySheet from './CompanySheet.jsx'

export default function App() {
  const [companies, setCompanies] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [typeF, setTypeF] = useState('') // '' | ministry | authority | company
  const [statusF, setStatusF] = useState('') // '' | open | reserved | completed
  const [cat, setCat] = useState('') // sector, only when typeF === company
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
  const counts = useMemo(() => {
    const c = { open: 0, reserved: 0, completed: 0 }
    companies.forEach((x) => { if (c[x.status] != null) c[x.status]++ })
    return c
  }, [companies])
  const filtered = useMemo(() => {
    const q = query.trim()
    return source.filter(
      (c) =>
        (!typeF || c.type === typeF) &&
        (!statusF || c.status === statusF) &&
        (typeF !== 'company' || !cat || c.category === cat) &&
        (!q || c.name.includes(q) || (c.short || '').includes(q)),
    )
  }, [source, query, typeF, statusF, cat])

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
            placeholder="ابحث عن جهة"
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

        {/* interactive status counters */}
        {view === 'all' && (
          <div className="stats">
            <button className={statusF === 'completed' ? 'stat completed active' : 'stat completed'} onClick={() => setStatusF(statusF === 'completed' ? '' : 'completed')}>
              <span className="stat-num">{counts.completed}</span>
              <span className="stat-label">مكتمل</span>
            </button>
            <button className={statusF === 'reserved' ? 'stat reserved active' : 'stat reserved'} onClick={() => setStatusF(statusF === 'reserved' ? '' : 'reserved')}>
              <span className="stat-num">{counts.reserved}</span>
              <span className="stat-label">محجوز</span>
            </button>
            <button className={statusF === 'open' ? 'stat open active' : 'stat open'} onClick={() => setStatusF(statusF === 'open' ? '' : 'open')}>
              <span className="stat-num">{counts.open}</span>
              <span className="stat-label">متوفر</span>
            </button>
          </div>
        )}

        {/* type chips: ministries / authorities / companies */}
        {view === 'all' && (
          <>
            <div className="chips">
              <button className={!typeF ? 'chip active' : 'chip'} onClick={() => { setTypeF(''); setCat('') }}>
                الكل
              </button>
              <button className={typeF === 'ministry' ? 'chip active' : 'chip'} onClick={() => { setTypeF('ministry'); setCat('') }}>
                الوزارات
              </button>
              <button className={typeF === 'authority' ? 'chip active' : 'chip'} onClick={() => { setTypeF('authority'); setCat('') }}>
                الهيئات
              </button>
              <button className={typeF === 'company' ? 'chip active' : 'chip'} onClick={() => { setTypeF('company'); setCat('') }}>
                الشركات
              </button>
            </div>

            {/* sector sub-filter, shown only for companies */}
            {typeF === 'company' && categories.length > 0 && (
              <div className="chips chips-sub">
                <button className={!cat ? 'chip active' : 'chip'} onClick={() => setCat('')}>
                  كل القطاعات
                </button>
                {categories.map((c) => (
                  <button key={c} className={cat === c ? 'chip active' : 'chip'} onClick={() => setCat(c)}>
                    {c}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <div className="list-head">
          <span className="count">{loading ? 'جارٍ التحميل…' : `${filtered.length} جهة`}</span>
          <button className="btn small primary" onClick={() => (getPhoneToken() ? setShowAdd(true) : setShowLogin(true))}>
            + إضافة جهة
          </button>
        </div>

        {loading ? null : filtered.length === 0 ? (
          <div className="empty">
            {view === 'mine' ? 'لا توجد جهات في قائمتك بعد.' : 'لا توجد نتائج.'}
          </div>
        ) : (
          <div className="grid">
            {filtered.map((c) => (
              <button key={c.id} className="card" onClick={() => setSelected(c)}>
                <div className="card-logo">
                  {c.logo ? <img src={c.logo} alt="" loading="lazy" /> : <span>{c.short || monogram(c.name)}</span>}
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
          onDone={() => setShowAdd(false)}
          onOpenExisting={(id) => {
            const c = companies.find((x) => x.id === id)
            setShowAdd(false)
            if (c) setSelected(c)
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

function AddCompany({ onClose, onDone, onOpenExisting }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [done, setDone] = useState(false)
  const [existing, setExisting] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const r = await submitCompany(name, category)
      if (r.exists) setExisting(r.company)
      else setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function forceAdd() {
    setBusy(true)
    try { await submitCompany(name, category, true); setExisting(null); setDone(true) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        {done ? (
          <div className="reserved-block">
            <div className="reserved-ok">✓ تم إرسال الجهة</div>
            <p className="muted">ستظهر بعد موافقة الإدارة. إذا لم يحجزها أحد، سنعود إليك.</p>
            <button className="btn primary full" onClick={onDone}>تم</button>
          </div>
        ) : existing ? (
          <div className="reserved-block">
            <div className="notice">
              <strong>هذه الجهة موجودة بالفعل</strong>
              <span>«{existing.name}»</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
              <StatusBadge status={existing.status} />
            </div>
            <button className="btn primary full" onClick={() => onOpenExisting?.(existing.id)}>عرض الجهة</button>
            <button className="btn ghost full" onClick={forceAdd} disabled={busy}>ليست نفسها — أضِفها كجديدة</button>
            <button className="btn ghost full" onClick={() => setExisting(null)}>تعديل الاسم</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h3>إضافة جهة</h3>
            <p className="muted">إذا لم تجد الجهة في القائمة، أضِف اسمها وسنراجعها.</p>
            <label>
              اسم الجهة *
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
