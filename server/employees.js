// Approximate employee counts per entity, sourced from LinkedIn Talent
// Insights (Saudi Arabia headcount). Used to pre-fill the commission
// calculator's slider with a per-entity smart default. Rounded to nearest 50.
// The slider clamps at 5,000+ so anything above is capped to 5000.
export const EMPLOYEES = {
  'مصرف الإنماء': 3900,
  'الإنماء': 3900,
  'مصرف الراجحي': 8200,
  'الراجحي': 8200,
  'شركة بدائل': 50,
  'هيئة الاتصالات والفضاء والتقنية': 900,
  'هيئة الاتصالات وتقنية المعلومات': 900,
  'Deloitte': 1550,
  'شركة علم': 4150,
  'EY': 1900,
  'الهيئة العامة للطيران المدني': 1750,
  'شركة جاهز العالمية': 700,
  'شركة لين': 550,
  'وزارة الثقافة': 2100,
  'شركة موبايلي': 6300,
  'شركة الإسكان الوطنية (NHC)': 1100,
  'شركة المربع الجديد': 100,
  'صندوق الاستثمارات العامة (PIF)': 3200,
  'البحر الأحمر العالمية': 3650,
  'بنك الرياض': 5850,
  'الرياض': 5850,
  'روشن': 1250,
  'البنك المركزي السعودي (ساما)': 2000,
  'حلول (Solutions by stc)': 3650,
  'stc': 12700,
  'شركة تحكم للاستثمار': 2950,
  'هيئة الزكاة والضريبة والجمارك': 5100,
}
