import { useEffect, useState } from 'react'
import { useLang } from './i18n.jsx'
import { getPhoneToken, getPhoneName, myCompanies } from './api.js'

// Floating support button + a bottom-sheet panel that hosts a quick getting-
// started checklist, a friendly greeting, and FAQs grouped into clickable
// category pills. Selecting a pill expands its questions; selecting a
// question reveals the answer.

const FAQ = [
  {
    id: 'general',
    label: 'أسئلة عامة',
    icon: 'help',
    items: [
      {
        q: 'ما هي منصة أكثم؟',
        a: 'أكثم منصة تحليلات القوى العاملة ودعم القرار بالذكاء الاصطناعي — تساعد فرق المبيعات والاستشارات على تحديد الجهات الأعلى احتياجاً في رأس المال البشري، وحجزها لتتولاها.',
      },
      {
        q: 'كيف تعمل المنصة؟',
        a: 'تتصفّح دليل الجهات (حكومي، شبه حكومي، شركات)، تشوف نقاط الألم ومعدّل التسرّب لكل جهة، تحجز التي تناسبك، ويتولّاها فريق أكثم لإغلاق الصفقة معك.',
      },
    ],
  },
  {
    id: 'reserve',
    label: 'الحجز والإلغاء',
    icon: 'bookmark',
    items: [
      {
        q: 'كيف أحجز جهة؟',
        a: 'افتح ورقة الجهة من القائمة، اضغط «حجز هذه الجهة»، أكّد الحجز، ثم تظهر لك خيارات المتابعة (واتساب مباشر، نتواصل عنك، أو ملاحظة).',
      },
      {
        q: 'كم مدة الحجز الافتراضية؟',
        a: '١٤ يوم من تاريخ الحجز. بعدها الجهة ترجع متاحة لغيرك إذا ما تواصلتم.',
      },
      {
        q: 'هل أقدر ألغي حجزي؟',
        a: 'نعم. افتح ورقة الجهة المحجوزة لك، واضغط «إلغاء الحجز». ترجع الجهة متاحة فوراً.',
      },
    ],
  },
  {
    id: 'commission',
    label: 'الحاسبة والعمولة',
    icon: 'calc',
    items: [
      {
        q: 'كيف تُحتسب العمولة؟',
        a: 'العمولة نسبة من قيمة الصفقة المتوقعة لكل جهة، مبنية على شريحة حجم المنشأة والقطاع. الرقم في الحاسبة تقدير تقريبي مبني على واقع السوق.',
      },
      {
        q: 'متى أستلم العمولة؟',
        a: 'بعد إغلاق الصفقة مع الجهة عبر فريق أكثم. تواصل معنا لتفاصيل اتفاقية العمولة قبل البدء.',
      },
      {
        q: 'ليش يختلف العائد بين القطاعات؟',
        a: 'لأن طبيعة الصفقات تختلف: الحكومي تكاليفه التشغيلية أعلى ومدة الإغلاق أطول، شبه الحكومي خط الأساس، والخاص يكون أكثر حساسية للسعر.',
      },
    ],
  },
  {
    id: 'data',
    label: 'البيانات والتسرّب',
    icon: 'data',
    items: [
      {
        q: 'من أين تجلبون بيانات الجهات؟',
        a: 'من مصادر متعددة: المواقع الرسمية للجهات، السوق المالية السعودية (تداول)، وبيانات LinkedIn Talent Insights للمعلومات الديموغرافية والتسرّب.',
      },
      {
        q: 'هل البيانات سرّية؟',
        a: 'البيانات داخل المنصة لا تُشارك مع جهات خارجية. ما تشوفه أنت كحاجز جهة يبقى ضمن نطاقك ونطاق فريق أكثم.',
      },
      {
        q: 'كيف يُحسب معدّل التسرّب الحرج؟',
        a: 'نعرض النسبة التي ترصدها LinkedIn للجهة خلال ١٢ شهر. الجهات الأعلى من حدّ الـ٢٠٪ تُصنّف «الأعلى احتياجاً».',
      },
    ],
  },
  {
    id: 'account',
    label: 'الحساب والوصول',
    icon: 'user',
    items: [
      {
        q: 'كيف أسجّل الدخول؟',
        a: 'سجّل الدخول برقم جوالك السعودي ورمز التحقق (OTP). بعدها تقدر تحجز وتتابع جهاتك من زر «قائمتي».',
      },
      {
        q: 'لم يصلني رمز التحقق',
        a: 'تأكّد من الرقم وأعد المحاولة بعد دقيقة. إذا استمرت المشكلة، أرسل لنا الرقم على دعم أكثم.',
      },
      {
        q: 'أبي أحذف حسابي',
        a: 'تواصل معنا وراح يتولّى الأدمن حذف الحساب وكل الحجوزات والتاريخ المرتبط بالرقم.',
      },
    ],
  },
  {
    id: 'contact',
    label: 'تواصل معنا',
    icon: 'chat',
    items: [
      {
        q: 'ما هي قنوات التواصل؟',
        a: 'أرسل لنا رسالة عبر واتساب أو البريد الإلكتروني المسجّل عند فريق أكثم. سيتم الرد خلال ساعات العمل (الأحد–الخميس).',
      },
    ],
  },
]

const STEPS = (logged, reserved) => [
  { id: 'login', label: 'تسجيل الدخول', done: logged },
  { id: 'browse', label: 'تصفّح الجهات', done: true },
  { id: 'open', label: 'فتح ورقة جهة', done: true },
  { id: 'reserve', label: 'حجز أول جهة', done: reserved },
]

export default function SupportWidget() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('support')
  const [picked, setPicked] = useState('general')
  const [openQ, setOpenQ] = useState(null)
  const [reservedAny, setReservedAny] = useState(false)
  const phoneToken = getPhoneToken()
  const name = (getPhoneName() || '').trim() || 'صديقي'

  useEffect(() => {
    if (!open || !phoneToken) return
    myCompanies().then((rows) => setReservedAny((rows || []).length > 0)).catch(() => {})
  }, [open, phoneToken])

  const steps = STEPS(!!phoneToken, reservedAny)
  const doneCount = steps.filter((s) => s.done).length
  const category = FAQ.find((c) => c.id === picked) || FAQ[0]

  function close() { setOpen(false); setOpenQ(null) }

  return (
    <>
      <button className="support-fab" aria-label="مساعدة" onClick={() => setOpen(true)}>
        <HelpIcon />
      </button>

      {open && (
        <div className="support-overlay" onClick={close}>
          <div className="support-panel" onClick={(e) => e.stopPropagation()}>
            <div className="support-head">
              <div className="support-brand">
                <img src="/aktham-logo.svg" alt="أكثم" />
                <strong>أكثم</strong>
              </div>
              <button className="support-close" onClick={close} aria-label="إغلاق">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                  <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            </div>

            <div className="support-tabs" role="tablist">
              <button
                className={tab === 'support' ? 'on' : ''}
                onClick={() => setTab('support')}
                role="tab"
              >
                <SupportIcon /> الدعم
              </button>
              <button
                className={tab === 'tips' ? 'on' : ''}
                onClick={() => setTab('tips')}
                role="tab"
              >
                <BulbIcon /> نصائح
              </button>
            </div>

            <div className="support-body">
              <div className="support-steps">
                <div className="support-steps-head">
                  <span><RocketIcon /> رحلتك مع أكثم</span>
                  <span className="support-steps-meta">{doneCount}/{steps.length}</span>
                </div>
                <ul>
                  {steps.map((s) => (
                    <li key={s.id} className={s.done ? 'done' : ''}>
                      <span className="dot" aria-hidden>
                        {s.done ? (
                          <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                        ) : null}
                      </span>
                      <span className="label">{s.label}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="support-hello">
                <h3>أهلاً، {name}</h3>
                <p>{tab === 'tips' ? 'نصائح سريعة لتحقيق أفضل استفادة من أكثم.' : 'كيف نقدر نساعدك اليوم؟'}</p>
              </div>

              <div className="support-pills">
                {FAQ.map((c) => (
                  <button
                    key={c.id}
                    className={'support-pill' + (c.id === picked ? ' on' : '')}
                    onClick={() => { setPicked(c.id); setOpenQ(null) }}
                  >
                    <CatIcon name={c.icon} /> {c.label}
                  </button>
                ))}
              </div>

              <div className="support-qa">
                {category.items.map((it, i) => {
                  const id = `${category.id}-${i}`
                  const isOpen = openQ === id
                  return (
                    <div key={id} className={'qa' + (isOpen ? ' open' : '')}>
                      <button className="qa-q" onClick={() => setOpenQ(isOpen ? null : id)}>
                        <span>{it.q}</span>
                        <svg viewBox="0 0 24 24" width="16" height="16" className={'qa-chev' + (isOpen ? ' rot' : '')} aria-hidden>
                          <path fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                        </svg>
                      </button>
                      {isOpen && <p className="qa-a">{it.a}</p>}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path fill="currentColor" d="M12 2a10 10 0 100 20 10 10 0 000-20zm.07 16.5a1.25 1.25 0 11.01-2.5 1.25 1.25 0 010 2.5zM13.3 13.3c-.7.45-.8.75-.8 1.2H11c0-1.18.45-1.7 1.25-2.2.5-.32.85-.55 1.05-.85.2-.3.2-.7 0-1-.2-.35-.6-.55-1.05-.55-.6 0-1.05.4-1.25 1H9.5c.1-1.45 1.2-2.5 2.75-2.5 1.55 0 2.6 1 2.6 2.35 0 1-.65 1.6-1.55 2.55z" />
    </svg>
  )
}
function SupportIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path fill="none" stroke="currentColor" strokeWidth="2" d="M12 2a10 10 0 100 20 10 10 0 000-20zM12 7l3 3M12 7l-3 3M12 17l3-3M12 17l-3-3" />
    </svg>
  )
}
function BulbIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path fill="currentColor" d="M9 21h6v-1H9v1zm3-20a7 7 0 00-4 12.74V17a1 1 0 001 1h6a1 1 0 001-1v-3.26A7 7 0 0012 1z" />
    </svg>
  )
}
function RocketIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path fill="currentColor" d="M14 6l4 4-8 8H6v-4l8-8zm5-2l1 1-2 2-1-1 2-2z" />
    </svg>
  )
}
function CatIcon({ name }) {
  const paths = {
    help: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 16.5a1.25 1.25 0 11.01-2.5 1.25 1.25 0 010 2.5zM13.3 13.3c-.7.45-.8.75-.8 1.2H11c0-1.18.45-1.7 1.25-2.2.5-.32.85-.55 1.05-.85.2-.3.2-.7 0-1-.2-.35-.6-.55-1.05-.55-.6 0-1.05.4-1.25 1H9.5c.1-1.45 1.2-2.5 2.75-2.5 1.55 0 2.6 1 2.6 2.35 0 1-.65 1.6-1.55 2.55z',
    bookmark: 'M17 3H7a2 2 0 00-2 2v16l7-3 7 3V5a2 2 0 00-2-2z',
    calc: 'M5 3h14v18H5zM7 5v3h10V5zm0 5h3v2H7zm4 0h3v2h-3zm4 0h3v2h-3zM7 13h3v2H7zm4 0h3v2h-3zm4 0h3v6h-3zM7 16h3v3H7zm4 0h3v3h-3z',
    data: 'M4 5h16v3H4zm0 5h16v3H4zm0 5h16v3H4z',
    user: 'M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-3.31 0-8 1.67-8 5v3h16v-3c0-3.33-4.69-5-8-5z',
    chat: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  }
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path fill="currentColor" d={paths[name] || paths.help} />
    </svg>
  )
}
