import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listAgencies } from './api.js'

const PAGE_SIZE = 6

export default function App() {
  const [agencies, setAgencies] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sortOrder, setSortOrder] = useState('ASC')
  const [page, setPage] = useState(0)

  useEffect(() => {
    listAgencies()
      .then(setAgencies)
      .catch(() => setAgencies([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim()
    let list = agencies.filter(
      (a) => a.name.includes(q) || a.short.includes(q),
    )
    list = [...list].sort((a, b) =>
      sortOrder === 'ASC'
        ? a.name.localeCompare(b.name, 'ar')
        : b.name.localeCompare(a.name, 'ar'),
    )
    return list
  }, [agencies, query, sortOrder])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const visible = filtered.slice(
    current * PAGE_SIZE,
    current * PAGE_SIZE + PAGE_SIZE,
  )

  return (
    <div className="app">
      <Header />

      <section className="hero">
        <div className="container">
          <nav className="breadcrumb">
            <span>الرئيسية</span>
            <span className="sep">/</span>
            <span>الجهات الحكومية</span>
            <span className="sep">/</span>
            <span className="current">الهيئات</span>
          </nav>
          <h1>الجهات الحكومية</h1>
          <p>تصفّح الهيئات الحكومية في المملكة العربية السعودية</p>
        </div>
      </section>

      <main className="container main">
        <div className="toolbar">
          <div className="search">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <path
                fill="currentColor"
                d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 10-.7.7l.27.28v.79l5 4.99L20.49 19zm-6 0A4.5 4.5 0 1114 9.5 4.5 4.5 0 019.5 14z"
              />
            </svg>
            <input
              type="search"
              placeholder="ابحث عن جهة حكومية"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(0)
              }}
            />
          </div>

          <div className="sort">
            <label htmlFor="sort">ترتيب حسب الاسم</label>
            <select
              id="sort"
              value={sortOrder}
              onChange={(e) => {
                setSortOrder(e.target.value)
                setPage(0)
              }}
            >
              <option value="ASC">تصاعدي (أ - ي)</option>
              <option value="DESC">تنازلي (ي - أ)</option>
            </select>
          </div>
        </div>

        <p className="result-count">
          {loading ? 'جارٍ التحميل…' : `${filtered.length} جهة`}
        </p>

        {loading ? null : visible.length === 0 ? (
          <div className="empty">لا توجد نتائج مطابقة للبحث.</div>
        ) : (
          <div className="grid">
            {visible.map((a) => (
              <AgencyCard key={a.id} agency={a} />
            ))}
          </div>
        )}

        {pageCount > 1 && (
          <Pagination
            page={current}
            pageCount={pageCount}
            onChange={setPage}
          />
        )}
      </main>

      <Footer />
    </div>
  )
}

function Header() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <div className="brand">
          <div className="brand-mark">SA</div>
          <div className="brand-text">
            <strong>المنصة الوطنية الموحدة</strong>
            <span>my.gov.sa</span>
          </div>
        </div>
        <nav className="top-nav">
          <a href="#">الرئيسية</a>
          <a href="#">الخدمات</a>
          <a className="active" href="#">
            الجهات الحكومية
          </a>
          <a href="#">عن المنصة</a>
        </nav>
        <button className="lang">English</button>
      </div>
    </header>
  )
}

function AgencyCard({ agency }) {
  const [broken, setBroken] = useState(false)
  return (
    <a
      className="card"
      href={agency.url}
      target={agency.url === '#' ? undefined : '_blank'}
      rel="noreferrer"
    >
      <div className="card-logo">
        {broken ? (
          <span className="logo-fallback">{agency.short}</span>
        ) : (
          <img
            src={agency.logo}
            alt={agency.name}
            loading="lazy"
            onError={() => setBroken(true)}
          />
        )}
      </div>
      <h3>{agency.name}</h3>
      <span className="card-cta">
        زيارة الموقع
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
          <path
            fill="currentColor"
            d="M15 4l-1.41 1.41L18.17 10H4v2h14.17l-4.58 4.59L15 18l7-7z"
            transform="scale(-1,1) translate(-24,0)"
          />
        </svg>
      </span>
    </a>
  )
}

function Pagination({ page, pageCount, onChange }) {
  return (
    <div className="pagination">
      <button
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
        aria-label="السابق"
      >
        السابق
      </button>
      {Array.from({ length: pageCount }).map((_, i) => (
        <button
          key={i}
          className={i === page ? 'page active' : 'page'}
          onClick={() => onChange(i)}
        >
          {i + 1}
        </button>
      ))}
      <button
        disabled={page === pageCount - 1}
        onClick={() => onChange(page + 1)}
        aria-label="التالي"
      >
        التالي
      </button>
    </div>
  )
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div className="brand">
          <div className="brand-mark">SA</div>
          <div className="brand-text">
            <strong>المنصة الوطنية الموحدة</strong>
            <span>نموذج تجريبي للتصميم</span>
          </div>
        </div>
        <div className="footer-links">
          <p>© {new Date().getFullYear()} جميع الحقوق محفوظة — نسخة تجريبية.</p>
          <Link to="/admin" className="admin-link">
            لوحة التحكم
          </Link>
        </div>
      </div>
    </footer>
  )
}
