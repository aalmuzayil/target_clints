import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  listCompanies,
  listCategories,
  myCompanies,
  submitCompany,
  publicSettings,
  getPhoneNumber,
  getPhoneName,
  getPhoneToken,
  clearPhoneSession,
} from './api.js'
import { StatusBadge, Deadline, monogram } from './shared.jsx'
import PhoneLogin from './PhoneLogin.jsx'
import CompanySheet from './CompanySheet.jsx'
import HeroIntro from './HeroIntro.jsx'
import { useLang } from './i18n.jsx'

// fallback "high attrition" threshold; real value comes from admin settings
const DEFAULT_HIGH_ATTRITION = 20

// list ordering: completed first, then reserved, then available
const STATUS_RANK = { completed: 0, reserved: 1, claimed: 1, open: 2 }

// entities shown per page
const PAGE_SIZE = 14

export default function App() {
  const { t, lang } = useLang()
  const displayName = (c) => (lang === 'en' && c.name_en ? c.name_en : c.name)
  const [companies, setCompanies] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [typeF, setTypeF] = useState('') // '' | ministry | authority | company
  const [statusF, setStatusF] = useState('') // '' | open | reserved | completed
  const [cat, setCat] = useState('') // sector, only when typeF === company
  const [view, setView] = useState('all') // all | mine
  const [highOnly, setHighOnly] = useState(false) // filter: high attrition only
  const [highThreshold, setHighThreshold] = useState(DEFAULT_HIGH_ATTRITION) // admin-set
  const [page, setPage] = useState(0) // current page (0-indexed)
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
  useEffect(() => {
    publicSettings()
      .then((s) => { if (s?.highAttritionThreshold) setHighThreshold(Number(s.highAttritionThreshold)) })
      .catch(() => {})
  }, [])

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
    return source
      .filter(
        (c) =>
          (!typeF || c.type === typeF) &&
          (!statusF || c.status === statusF) &&
          (typeF !== 'company' || !cat || c.category === cat) &&
          (!highOnly || (c.attrition_rate != null && c.attrition_rate !== '' && Number(c.attrition_rate) >= highThreshold)) &&
          (!q || c.name.includes(q) || (c.short || '').includes(q)),
      )
      .sort((a, b) => (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3))
  }, [source, query, typeF, statusF, cat, highOnly, highThreshold])

  // pagination: 7 per page; reset to first page whenever the filters change
  useEffect(() => { setPage(0) }, [query, typeF, statusF, cat, highOnly, view])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

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

      <HeroIntro
        view={view}
        onAll={() => setView('all')}
        onMine={() => (getPhoneToken() ? setView('mine') : setShowLogin(true))}
      />

      <main className="container main" id="entities">
        {/* search */}
        <div className="searchbar">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 10-.7.7l.27.28v.79l5 4.99L20.49 19zm-6 0A4.5 4.5 0 1114 9.5 4.5 4.5 0 019.5 14z" />
          </svg>
          <input
            type="search"
            placeholder={t('searchPh')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* type chips: ministries / authorities / companies */}
        {view === 'all' && (
          <>
            <div className="chips">
              <button className={!typeF ? 'chip active' : 'chip'} onClick={() => { setTypeF(''); setCat('') }}>
                {t('all')}
              </button>
              <button className={typeF === 'ministry' ? 'chip active' : 'chip'} onClick={() => { setTypeF('ministry'); setCat('') }}>
                {t('ministries')}
              </button>
              <button className={typeF === 'authority' ? 'chip active' : 'chip'} onClick={() => { setTypeF('authority'); setCat('') }}>
                {t('authorities')}
              </button>
              <button className={typeF === 'company' ? 'chip active' : 'chip'} onClick={() => { setTypeF('company'); setCat('') }}>
                {t('companies')}
              </button>
            </div>

            {/* sector sub-filter, shown only for companies */}
            {typeF === 'company' && categories.length > 0 && (
              <div className="chips chips-sub">
                <button className={!cat ? 'chip active' : 'chip'} onClick={() => setCat('')}>
                  {t('allSectors')}
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

        {view === 'all' && (
          <div className="attr-bar">
            <label className="switch">
              <input type="checkbox" checked={highOnly} onChange={(e) => setHighOnly(e.target.checked)} />
              <span className="track"><span className="knob" /></span>
              <span className="switch-label">{t('highToggle', highThreshold)}</span>
            </label>
            <p className="attr-def">{t('indexDef', highThreshold)}</p>
          </div>
        )}

        <div className="list-head">
          <span className="count">{loading ? t('loading') : t('entities', filtered.length)}</span>
          <button className="btn small primary" onClick={() => (getPhoneToken() ? setShowAdd(true) : setShowLogin(true))}>
            {t('addEntity')}
          </button>
        </div>

        {loading ? null : filtered.length === 0 ? (
          <div className="empty">
            {view === 'mine' ? t('noMine') : t('noResults')}
          </div>
        ) : (
          <div className="dir-list">
            {pageItems.map((c) => (
              <button key={c.id} className="dir-row" onClick={() => setSelected(c)}>
                <div className="dir-logo-wrap">
                  <div className="dir-logo">
                    {c.logo ? <img src={c.logo} alt="" loading="lazy" /> : <span>{c.short || monogram(displayName(c))}</span>}
                  </div>
                  {c.attrition_rate != null && c.attrition_rate !== '' && (
                    <span className={'dir-mark' + (Number(c.attrition_rate) >= highThreshold ? ' high' : '')}>
                      {c.attrition_rate}%
                    </span>
                  )}
                </div>
                <div className="dir-info">
                  <strong>{displayName(c)}</strong>
                  <span className="dir-sub">
                    {c.attrition_rate != null && c.attrition_rate !== ''
                      ? t('attrition', c.attrition_rate)
                      : (c.category || (c.type === 'ministry' ? t('typeMinistry') : c.type === 'authority' ? t('typeAuthority') : t('typeCompany')))}
                    <Deadline deadline={c.reserve_deadline} status={c.status} />
                  </span>
                </div>
                <div className="dir-action">
                  {c.status === 'open'
                    ? <span className="dir-claim">{t('reserve')}</span>
                    : <StatusBadge status={c.status} />}
                </div>
              </button>
            ))}
          </div>
        )}

        {!loading && pageCount > 1 && (
          <div className="pager">
            <button
              className="pager-btn"
              disabled={safePage === 0}
              aria-label="previous page"
              onClick={() => { setPage((p) => Math.max(0, p - 1)); document.getElementById('entities')?.scrollIntoView() }}
            >
              {lang === 'ar' ? '›' : '‹'}
            </button>
            <span className="pager-info">{safePage + 1} / {pageCount}</span>
            <button
              className="pager-btn"
              disabled={safePage >= pageCount - 1}
              aria-label="next page"
              onClick={() => { setPage((p) => Math.min(pageCount - 1, p + 1)); document.getElementById('entities')?.scrollIntoView() }}
            >
              {lang === 'ar' ? '‹' : '›'}
            </button>
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
  const { t, lang, toggle } = useLang()
  return (
    <header className="site-header">
      <div className="container header-inner">
        <a className="brand" href="/">
          <img className="brand-logo" src="/aktham-logo.svg" alt={t('brandAlt')} />
        </a>
        <div className="account">
          <button className="lang-toggle" onClick={toggle} aria-label="Switch language" title="Switch language">
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>
          {phone ? (
            <>
              <span className="acc-phone" dir={name ? 'rtl' : 'ltr'}>{name || phone}</span>
              <button className="btn ghost small" onClick={onLogout}>{t('signOut')}</button>
            </>
          ) : (
            <button className="btn primary small" onClick={onLogin}>{t('signIn')}</button>
          )}
        </div>
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
  const { t } = useLang()
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <img className="brand-logo-white" src="/aktham-logo-white.svg" alt={t('brandAlt')} />
        <div className="footer-links">
          <span>{t('rights', new Date().getFullYear())}</span>
          <Link to="/admin" className="admin-link">{t('adminPanel')}</Link>
        </div>
      </div>
    </footer>
  )
}
