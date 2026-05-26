import { createContext, useContext, useEffect, useState, useCallback } from 'react'

const STRINGS = {
  ar: {
    brandAlt: 'أكثم',
    signIn: 'تسجيل الدخول',
    signOut: 'خروج',
    heroTitle: 'قنوات التوسع المستهدفة',
    heroSub: '70% من الرؤساء التنفيذيين يضعون «تسرب المواهب» كأكبر تحدٍّ يواجهونه.',
    allCompanies: 'كل الشركات',
    myList: 'قائمتي',
    trusted: 'موثوقون من فرق في',
    searchPh: 'ابحث عن جهة',
    available: 'متوفر',
    reserved: 'محجوز',
    completed: 'مكتمل',
    all: 'الكل',
    ministries: 'الوزارات',
    authorities: 'الهيئات',
    companies: 'الشركات',
    allSectors: 'كل القطاعات',
    loading: 'جارٍ التحميل…',
    entities: (n) => `${n} جهة`,
    addEntity: '+ إضافة جهة',
    noResults: 'لا توجد نتائج.',
    noMine: 'لا توجد جهات في قائمتك بعد.',
    reserve: 'حجز',
    typeMinistry: 'وزارة',
    typeAuthority: 'هيئة',
    typeCompany: 'شركة',
    attrition: (n) => `معدل التسرب الحرج: ${n}%`,
    highToggle: () => 'الأعلى تسرّبًا فقط',
    indexDef: (h) => `مؤشر التسرب الحرج: نسبة الكفاءات المعرّضة لمغادرة الجهة — يُعدّ مرتفعًا عند ${h}% فأكثر.`,
    rights: (y) => `© ${y} أكثم — جميع الحقوق محفوظة`,
    adminPanel: 'لوحة التحكم',
  },
  en: {
    brandAlt: 'Aktham',
    signIn: 'Sign in',
    signOut: 'Sign out',
    heroTitle: 'Targeted Expansion Channels',
    heroSub: '70% of executives rank “talent leakage” as the biggest challenge they face.',
    allCompanies: 'All companies',
    myList: 'My list',
    trusted: 'Trusted by teams at',
    searchPh: 'Search for an entity',
    available: 'Available',
    reserved: 'Reserved',
    completed: 'Completed',
    all: 'All',
    ministries: 'Ministries',
    authorities: 'Authorities',
    companies: 'Companies',
    allSectors: 'All sectors',
    loading: 'Loading…',
    entities: (n) => `${n} ${n === 1 ? 'entity' : 'entities'}`,
    addEntity: '+ Add entity',
    noResults: 'No results.',
    noMine: 'No entities in your list yet.',
    reserve: 'Reserve',
    typeMinistry: 'Ministry',
    typeAuthority: 'Authority',
    typeCompany: 'Company',
    attrition: (n) => `Critical attrition rate: ${n}%`,
    highToggle: () => 'High-attrition only',
    indexDef: (h) => `Critical attrition index: share of key talent at risk of leaving — high at ${h}%+.`,
    rights: (y) => `© ${y} Aktham — All rights reserved`,
    adminPanel: 'Admin',
  },
}

const LangContext = createContext(null)

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem('lang') || 'ar')
  const dir = lang === 'ar' ? 'rtl' : 'ltr'

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir
    try { localStorage.setItem('lang', lang) } catch {}
  }, [lang, dir])

  const setLang = useCallback((l) => setLangState(l), [])
  const toggle = useCallback(() => setLangState((l) => (l === 'ar' ? 'en' : 'ar')), [])
  const t = useCallback(
    (key, ...args) => {
      const v = (STRINGS[lang] || STRINGS.ar)[key]
      return typeof v === 'function' ? v(...args) : v ?? key
    },
    [lang],
  )

  return <LangContext.Provider value={{ lang, dir, setLang, toggle, t }}>{children}</LangContext.Provider>
}

export function useLang() {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used within LangProvider')
  return ctx
}
