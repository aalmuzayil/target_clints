import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  listCompanies,
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
import LogoMarquee from './LogoMarquee.jsx'
import StoryScreens from './StoryScreens.jsx'
import SupportWidget from './SupportWidget.jsx'
import { useLang } from './i18n.jsx'

// fallback "high attrition" threshold; real value comes from admin settings
const DEFAULT_HIGH_ATTRITION = 20

// list ordering: default puts completed/reserved first (showcases activity);
// the "available first" toggle inverts the order so open entities lead the list.
const STATUS_RANK = { completed: 0, reserved: 1, claimed: 1, open: 2 }
const STATUS_RANK_AVAIL = { open: 0, reserved: 1, claimed: 1, completed: 2 }

// entities shown per page
const PAGE_SIZE = 7

export default function App() {
  const { t, lang } = useLang()
  const displayName = (c) => (lang === 'en' && c.name_en ? c.name_en : c.name)
  const typeLabel = (type) =>
    type === 'ministry' ? t('typeMinistry')
      : type === 'authority' ? t('typeAuthority')
        : type === 'semi' ? t('typeSemi')
          : t('typeCompany')
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [tierF, setTierF] = useState('') // '' | gov | semi | company
  const [statusF, setStatusF] = useState('') // '' | open | reserved | completed
  const [sub, setSub] = useState('') // gov: ministry|authority ; semi/company: category
  const [view, setView] = useState('all') // all | mine
  const [highOnly, setHighOnly] = useState(false) // filter: high attrition only
  const [highThreshold, setHighThreshold] = useState(DEFAULT_HIGH_ATTRITION) // admin-set
  const [page, setPage] = useState(0) // current page (0-indexed)
  const [layout, setLayout] = useState('list') // list | grid
  const [availFirst, setAvailFirst] = useState(false) // sort: when true, available entities come first (reserved/completed at the end)
  const [phone, setPhone] = useState(getPhoneNumber())
  const [name, setName] = useState(getPhoneName())
  const [showLogin, setShowLogin] = useState(false)
  const [selected, setSelected] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [mine, setMine] = useState([])

  function loadAll() {
    setLoading(true)
    listCompanies()
      .then(setCompanies)
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
  // sub-filter option lists, derived from loaded data
  const sectors = useMemo(
    () => [...new Set(companies.filter((c) => c.type === 'company').map((c) => c.category).filter(Boolean))].sort(),
    [companies],
  )
  const affiliations = useMemo(
    () => [...new Set(companies.filter((c) => c.type === 'semi').map((c) => c.category).filter(Boolean))].sort(),
    [companies],
  )
  const filtered = useMemo(() => {
    const q = query.trim()
    const inTier = (c) =>
      !tierF ||
      (tierF === 'gov' && (c.type === 'ministry' || c.type === 'authority')) ||
      (tierF === 'semi' && c.type === 'semi') ||
      (tierF === 'company' && c.type === 'company')
    const inSub = (c) => {
      if (!sub) return true
      if (tierF === 'gov') return c.type === sub
      return c.category === sub // semi affiliation or company sector
    }
    return source
      .filter(
        (c) =>
          inTier(c) &&
          inSub(c) &&
          (!statusF || c.status === statusF) &&
          (!highOnly || (c.profile || '').includes('أبرز التحديات')) &&
          (!q || c.name.includes(q) || (c.short || '').includes(q)),
      )
      .sort((a, b) => {
        const rank = availFirst ? STATUS_RANK_AVAIL : STATUS_RANK
        return (rank[a.status] ?? 3) - (rank[b.status] ?? 3)
      })
  }, [source, query, tierF, sub, statusF, highOnly, availFirst])

  // pagination: reset to first page whenever the filters change
  useEffect(() => { setPage(0) }, [query, tierF, sub, statusF, highOnly, view])
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

        {/* tier chips: government / semi-government / companies */}
        {view === 'all' && (
          <>
            <div className="chips">
              <button className={!tierF ? 'chip active' : 'chip'} onClick={() => { setTierF(''); setSub('') }}>
                {t('all')}
              </button>
              <button className={tierF === 'gov' ? 'chip active' : 'chip'} onClick={() => { setTierF('gov'); setSub('') }}>
                {t('government')}
              </button>
              <button className={tierF === 'semi' ? 'chip active' : 'chip'} onClick={() => { setTierF('semi'); setSub('') }}>
                {t('semiGov')}
              </button>
              <button className={tierF === 'company' ? 'chip active' : 'chip'} onClick={() => { setTierF('company'); setSub('') }}>
                {t('companies')}
              </button>
            </div>

            {/* government sub-filter: ministries / authorities */}
            {tierF === 'gov' && (
              <div className="chips chips-sub">
                <button className={!sub ? 'chip active' : 'chip'} onClick={() => setSub('')}>{t('all')}</button>
                <button className={sub === 'ministry' ? 'chip active' : 'chip'} onClick={() => setSub('ministry')}>{t('ministries')}</button>
                <button className={sub === 'authority' ? 'chip active' : 'chip'} onClick={() => setSub('authority')}>{t('authorities')}</button>
              </div>
            )}

            {/* semi-government sub-filter: affiliation */}
            {tierF === 'semi' && affiliations.length > 0 && (
              <div className="chips chips-sub">
                <button className={!sub ? 'chip active' : 'chip'} onClick={() => setSub('')}>{t('allAffiliations')}</button>
                {affiliations.map((a) => (
                  <button key={a} className={sub === a ? 'chip active' : 'chip'} onClick={() => setSub(a)}>{a}</button>
                ))}
              </div>
            )}

            {/* company sub-filter: sector */}
            {tierF === 'company' && sectors.length > 0 && (
              <div className="chips chips-sub">
                <button className={!sub ? 'chip active' : 'chip'} onClick={() => setSub('')}>{t('allSectors')}</button>
                {sectors.map((c) => (
                  <button key={c} className={sub === c ? 'chip active' : 'chip'} onClick={() => setSub(c)}>{c}</button>
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
              <span className="switch-label"><NeedIcon /> {t('highToggle', highThreshold)}</span>
            </label>
            <p className="attr-def">{t('indexDef', highThreshold)}</p>
          </div>
        )}

        <div className="list-head">
          <span className="count">{loading ? t('loading') : t('entities', filtered.length)}</span>
          <div className="lh-actions">
            <button
              className={'sort-toggle' + (availFirst ? ' on' : '')}
              onClick={() => setAvailFirst((v) => !v)}
              title={availFirst ? t('sortAvailableFirst') : t('sortCompletedFirst')}
            >
              <SortIcon /> {availFirst ? t('sortAvailableFirst') : t('sortCompletedFirst')}
            </button>
            <div className="view-mode" role="group" aria-label="view mode">
              <button className={layout === 'list' ? 'active' : ''} onClick={() => setLayout('list')} aria-label="list view"><ListIcon /></button>
              <button className={layout === 'grid' ? 'active' : ''} onClick={() => setLayout('grid')} aria-label="grid view"><GridIcon /></button>
            </div>
            <button className="btn small primary" onClick={() => (getPhoneToken() ? setShowAdd(true) : setShowLogin(true))}>
              {t('addEntity')}
            </button>
          </div>
        </div>

        {loading ? null : filtered.length === 0 ? (
          <div className="empty">
            {view === 'mine' ? t('noMine') : t('noResults')}
          </div>
        ) : layout === 'grid' ? (
          <div className="grid">
            {pageItems.map((c) => (
              <button key={c.id} className="card" onClick={() => setSelected(c)}>
                <div className="card-logo-wrap">
                  <div className="card-logo">
                    {c.logo ? <img src={c.logo} alt="" loading="lazy" /> : <span>{c.short || monogram(displayName(c))}</span>}
                  </div>
                  {c.attrition_rate != null && c.attrition_rate !== '' && (
                    <span className={'dir-mark' + (Number(c.attrition_rate) >= highThreshold ? ' high' : '')}>{c.attrition_rate}%</span>
                  )}
                </div>
                <Deadline deadline={c.reserve_deadline} status={c.status} />
                <h3>{displayName(c)}</h3>
                <div className="card-foot">
                  <StatusBadge status={c.status} />
                  {c.category ? <span className="chip-sm">{c.category}</span> : null}
                </div>
              </button>
            ))}
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
                      ? <span className="attr-label">{t('attrition', c.attrition_rate)}</span>
                      : (c.category || typeLabel(c.type))}
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
              <Chevron dir={lang === 'ar' ? 'right' : 'left'} />
            </button>
            {pageList(safePage + 1, pageCount).map((p, i) =>
              p === '…' ? (
                <span key={`gap${i}`} className="pager-gap">…</span>
              ) : (
                <button
                  key={p}
                  className={'pager-num' + (p === safePage + 1 ? ' active' : '')}
                  aria-current={p === safePage + 1 ? 'page' : undefined}
                  onClick={() => { setPage(p - 1); document.getElementById('entities')?.scrollIntoView() }}
                >
                  {p}
                </button>
              ),
            )}
            <button
              className="pager-btn"
              disabled={safePage >= pageCount - 1}
              aria-label="next page"
              onClick={() => { setPage((p) => Math.min(pageCount - 1, p + 1)); document.getElementById('entities')?.scrollIntoView() }}
            >
              <Chevron dir={lang === 'ar' ? 'left' : 'right'} />
            </button>
          </div>
        )}
      </main>

      <section className="stories-strip">
        <StoryScreens />
      </section>

      <section className="clients-strip">
        <LogoMarquee />
      </section>

      <Footer />

      <SupportWidget />

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
          onOpenCompany={(c) => setSelected(c)}
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

// compact page list with ellipses: always shows first, last, and a window
// around the current page (1-indexed). e.g. [1, '…', 4, 5, 6, '…', 58]
function pageList(current, total) {
  const set = new Set([1, total, current, current - 1, current + 1])
  const arr = [...set].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const out = []
  let prev = 0
  for (const p of arr) {
    if (p - prev > 1) out.push('…')
    out.push(p)
    prev = p
  }
  return out
}

function Chevron({ dir }) {
  const d = dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}

function NeedIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden className="need-icon">
      <path fill="currentColor" d="M13 2L4.5 13.5h6L11 22l8.5-11.5h-6L13 2z" />
    </svg>
  )
}
function SortIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M7 4v14m0 0l-3-3m3 3l3-3M17 20V6m0 0l-3 3m3-3l3 3" />
    </svg>
  )
}
function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </svg>
  )
}
function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
    </svg>
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
