import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import twilio from 'twilio'
import { db, seed, DEFAULT_INTRO, DEFAULT_PROFILE } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(ROOT, 'data', 'uploads')
const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me'
const PORT = process.env.PORT || 3001
// OTP delivery. If Twilio Verify env vars are present we use Twilio (real codes via
// SMS or WhatsApp). Otherwise we run in "dev mode" and return the code in the response.
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_VERIFY_SID = process.env.TWILIO_VERIFY_SERVICE_SID
const OTP_CHANNEL = process.env.OTP_CHANNEL || 'sms' // 'sms' | 'whatsapp' | 'call'
const DEFAULT_CC = (process.env.DEFAULT_COUNTRY_CODE || '966').replace(/\D/g, '')
const twilioEnabled = !!(TWILIO_SID && TWILIO_TOKEN && TWILIO_VERIFY_SID)
const twilioClient = twilioEnabled ? twilio(TWILIO_SID, TWILIO_TOKEN) : null
// Modes: 'twilio' (real OTP) > 'dev' (code shown on screen, set OTP_DEV=1) > 'none'
// (no verification: phone is just a login identifier). Default is 'none'.
const OTP_MODE = twilioEnabled ? `twilio:${OTP_CHANNEL}` : process.env.OTP_DEV === '1' ? 'dev' : 'none'

fs.mkdirSync(UPLOAD_DIR, { recursive: true })
seed()

const app = express()
app.use(express.json())

// ---------- uploads ----------
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png'
    cb(null, `logo-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`)
  },
})
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'logoFile') return cb(null, /^image\//.test(file.mimetype))
    // profileFile: allow PDF / docs / images
    cb(null, true)
  },
})
const companyUpload = upload.fields([
  { name: 'logoFile', maxCount: 1 },
  { name: 'profileFile', maxCount: 1 },
])
const fileUrl = (f) => (f ? `/uploads/${f.filename}` : '')

// ---------- helpers ----------
const now = () => Date.now()
const onlyDigits = (s) => String(s || '').replace(/\D/g, '')

// append an immutable analytics event (sales-funnel tracking). Never throws.
const logEvent = (e) => {
  try {
    db.prepare(
      `INSERT INTO events (type, company_id, company_name, actor, from_status, to_status, meta, created_at)
       VALUES (@type, @company_id, @company_name, @actor, @from_status, @to_status, @meta, @created_at)`,
    ).run({
      type: e.type,
      company_id: e.company_id ?? null,
      company_name: e.company_name || '',
      actor: e.actor || '',
      from_status: e.from_status || '',
      to_status: e.to_status || '',
      meta: e.meta ? JSON.stringify(e.meta) : '',
      created_at: now(),
    })
  } catch (err) {
    console.error('[events] log failed', err.message)
  }
}
const getCompanyName = (id) => db.prepare('SELECT name FROM agencies WHERE id = ?').get(id)?.name || ''

function waLink(phone, text) {
  const digits = onlyDigits(phone)
  if (!digits) return ''
  return `https://wa.me/${digits}?text=${encodeURIComponent(text || '')}`
}

function publicCompany(row) {
  if (!row) return row
  const { contact_phone, submitted_by, ...rest } = row
  return rest
}

// ---- settings + layered profile resolution ----
function getSetting(key, fallback = '') {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return r ? r.value : fallback
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}
// profile file priority: company-specific > category > global default
function resolveProfile(company) {
  if (company?.profile_file) return company.profile_file
  if (company?.category) {
    const c = db.prepare('SELECT profile_file FROM category_profiles WHERE category = ?').get(company.category)
    if (c?.profile_file) return c.profile_file
  }
  return getSetting('default_profile_file', DEFAULT_PROFILE)
}

// convert a locally-entered number (e.g. 0501234567) to E.164 (+9665XXXXXXXX) for Twilio
function toE164(raw) {
  let d = onlyDigits(raw)
  if (!d) return ''
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith(DEFAULT_CC)) return '+' + d
  if (d.startsWith('0')) d = d.slice(1)
  return '+' + DEFAULT_CC + d
}

function sign(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' })
}

// access control: 'allowlist' = only admin-approved numbers can sign in; others
// become pending requests. 'open' = anyone can sign in.
const ACCESS_MODE = process.env.ACCESS_MODE || 'allowlist'

function accessStatus(phone) {
  const u = db.prepare('SELECT status FROM phone_users WHERE phone = ?').get(phone)
  return u ? u.status : 'none'
}
function getUser(phone) {
  return db.prepare('SELECT name, nickname FROM phone_users WHERE phone = ?').get(phone) || { name: '', nickname: '' }
}
function getName(phone) {
  return getUser(phone).name || ''
}
// upsert a user's status; sets name/nickname only when a non-empty value is provided
function setPhoneUser(phone, status, name, nickname) {
  const u = db.prepare('SELECT 1 FROM phone_users WHERE phone = ?').get(phone)
  if (u) {
    db.prepare('UPDATE phone_users SET status = ? WHERE phone = ?').run(status, phone)
    if (name) db.prepare('UPDATE phone_users SET name = ? WHERE phone = ?').run(name, phone)
    if (nickname) db.prepare('UPDATE phone_users SET nickname = ? WHERE phone = ?').run(nickname, phone)
  } else {
    db.prepare('INSERT INTO phone_users (phone, name, nickname, created_at, status) VALUES (?, ?, ?, ?, ?)').run(
      phone, name || '', nickname || '', now(), status,
    )
  }
}
// record an access request for an unknown number (does not downgrade existing users)
function recordPending(phone, name) {
  const u = db.prepare('SELECT name FROM phone_users WHERE phone = ?').get(phone)
  if (!u) db.prepare("INSERT INTO phone_users (phone, name, created_at, status) VALUES (?, ?, ?, 'pending')").run(phone, name || '', now())
  else if (name && !u.name) db.prepare('UPDATE phone_users SET name = ? WHERE phone = ?').run(name, phone)
}
function blockedByAllowlist(phone) {
  return ACCESS_MODE === 'allowlist' && accessStatus(phone) !== 'approved'
}

function adminAuth(req, res, next) {
  const t = (req.headers.authorization || '').replace(/^Bearer /, '')
  try {
    const p = jwt.verify(t, JWT_SECRET)
    if (p.type !== 'admin') throw new Error('not admin')
    req.admin = p
    next()
  } catch {
    res.status(401).json({ error: 'صلاحية المسؤول مطلوبة' })
  }
}

function phoneAuth(req, res, next) {
  const t = (req.headers.authorization || '').replace(/^Bearer /, '')
  try {
    const p = jwt.verify(t, JWT_SECRET)
    if (p.type !== 'phone') throw new Error('not phone')
    req.phone = p.phone
    next()
  } catch {
    res.status(401).json({ error: 'يجب تسجيل الدخول برقم الجوال' })
  }
}

// ============================================================
//  ADMIN AUTH
// ============================================================
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {}
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').toLowerCase())
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' })
  }
  res.json({ token: sign({ type: 'admin', id: user.id, email: user.email }), email: user.email })
})

// ============================================================
//  PHONE (USER) AUTH — OTP
// ============================================================
app.post('/api/auth/request-otp', async (req, res) => {
  const phone = onlyDigits(req.body?.phone)
  const name = String(req.body?.name || '').trim()
  if (phone.length < 7) return res.status(400).json({ error: 'رقم جوال غير صحيح' })

  // allowlist gate: unknown/not-approved numbers become a pending request (no access yet)
  if (blockedByAllowlist(phone)) {
    recordPending(phone, name)
    return res.json({ pending: true })
  }

  if (twilioEnabled) {
    try {
      await twilioClient.verify.v2
        .services(TWILIO_VERIFY_SID)
        .verifications.create({ to: toE164(phone), channel: OTP_CHANNEL })
      return res.json({ ok: true })
    } catch (e) {
      console.error('[twilio] send failed:', e?.message)
      return res.status(502).json({ error: 'تعذّر إرسال رمز التحقق، حاول لاحقاً' })
    }
  }

  if (OTP_MODE === 'none') {
    // no verification: phone is just an identifier -> log in immediately
    setPhoneUser(phone, 'approved', name)
    const u = getUser(phone)
    return res.json({ ok: true, token: sign({ type: 'phone', phone }), phone, name: u.name, nickname: u.nickname, skipVerify: true })
  }

  // dev mode (code shown on screen)
  const code = String(Math.floor(100000 + Math.random() * 900000))
  db.prepare('INSERT OR REPLACE INTO otps (phone, code, expires_at) VALUES (?, ?, ?)').run(
    phone, code, now() + 5 * 60 * 1000,
  )
  console.log(`[otp:dev] ${phone} -> ${code}`)
  res.json({ ok: true, devCode: code })
})

app.post('/api/auth/verify-otp', async (req, res) => {
  const phone = onlyDigits(req.body?.phone)
  const code = String(req.body?.code || '')
  const name = String(req.body?.name || '').trim()

  if (twilioEnabled) {
    try {
      const check = await twilioClient.verify.v2
        .services(TWILIO_VERIFY_SID)
        .verificationChecks.create({ to: toE164(phone), code })
      if (check.status !== 'approved') {
        return res.status(401).json({ error: 'رمز التحقق غير صحيح أو منتهي' })
      }
    } catch (e) {
      console.error('[twilio] check failed:', e?.message)
      return res.status(401).json({ error: 'رمز التحقق غير صحيح أو منتهي' })
    }
  } else {
    const row = db.prepare('SELECT * FROM otps WHERE phone = ?').get(phone)
    if (!row || row.code !== code || row.expires_at < now()) {
      return res.status(401).json({ error: 'رمز التحقق غير صحيح أو منتهي' })
    }
    db.prepare('DELETE FROM otps WHERE phone = ?').run(phone)
  }

  if (blockedByAllowlist(phone)) {
    recordPending(phone, name)
    return res.status(403).json({ pending: true, error: 'رقمك بانتظار موافقة الإدارة' })
  }
  setPhoneUser(phone, 'approved', name)
  const u = getUser(phone)
  res.json({ token: sign({ type: 'phone', phone }), phone, name: u.name, nickname: u.nickname })
})

// current user's profile (name shown in the UI)
app.get('/api/me', phoneAuth, (req, res) => {
  res.json({ phone: req.phone, ...getUser(req.phone) })
})

// ============================================================
//  PUBLIC CATALOG
// ============================================================
app.get('/api/companies', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM agencies WHERE approved = 1 ORDER BY sort_order ASC, id ASC')
    .all()
  res.json(rows.map(publicCompany))
})

// sectors (categories) of company-type entries — used for the company sub-filter
app.get('/api/companies/categories', (_req, res) => {
  const rows = db
    .prepare("SELECT DISTINCT category FROM agencies WHERE approved = 1 AND type = 'company' AND category <> '' ORDER BY category")
    .all()
  res.json(rows.map((r) => r.category))
})

app.get('/api/public-settings', (_req, res) => {
  res.json({
    introMessage: getSetting('intro_message', DEFAULT_INTRO),
    highAttritionThreshold: Number(getSetting('high_attrition_threshold', '20')) || 20,
  })
})

app.get('/api/companies/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM agencies WHERE id = ? AND approved = 1').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'الشركة غير موجودة' })
  res.json(publicCompany(row))
})

// ============================================================
//  USER ACTIONS (phone auth)
// ============================================================
const DEFAULT_HOLD_MS = 14 * 24 * 60 * 60 * 1000

app.post('/api/companies/:id/reserve', phoneAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM agencies WHERE id = ? AND approved = 1').get(req.params.id)
  if (!c) return res.status(404).json({ error: 'الجهة غير موجودة' })
  if (c.status !== 'open') {
    return res.status(409).json({ error: 'هذه الجهة غير متاحة للحجز حالياً' })
  }
  const deadline = c.reserve_deadline || now() + DEFAULT_HOLD_MS
  db.prepare("UPDATE agencies SET status='reserved', reserved_by=?, reserve_deadline=? WHERE id=?").run(
    req.phone, deadline, c.id,
  )
  const info = db.prepare(
    'INSERT INTO reservations (company_id, phone, message, status, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(c.id, req.phone, req.body?.message || '', 'pending', now())
  logEvent({ type: 'reserve', company_id: c.id, company_name: c.name, actor: req.phone, from_status: 'open', to_status: 'reserved' })

  const premade = `مرحباً، أنا مهتم بشركة "${c.name}" وأرغب في حجزها. هذا رقمي: ${req.phone}`
  res.json({
    ok: true,
    reservationId: info.lastInsertRowid,
    company: publicCompany({ ...c, status: 'reserved' }),
    contact_phone: c.contact_phone,
    profile_file: resolveProfile(c),
    introMessage: getSetting('intro_message', DEFAULT_INTRO),
    premadeMessage: premade,
    whatsappLink: c.contact_phone ? waLink(c.contact_phone, premade) : '',
    deadline,
  })
})

// the reserving user can release their own reservation
app.post('/api/companies/:id/cancel-reservation', phoneAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM agencies WHERE id = ?').get(req.params.id)
  if (!c) return res.status(404).json({ error: 'الجهة غير موجودة' })
  if (c.status !== 'reserved') return res.status(409).json({ error: 'هذه الجهة ليست محجوزة' })
  if (c.reserved_by !== req.phone) return res.status(403).json({ error: 'لا يمكنك إلغاء حجز ليس لك' })
  db.prepare("UPDATE agencies SET status='open', reserved_by='', reserve_deadline=NULL WHERE id=?").run(c.id)
  db.prepare("UPDATE reservations SET status='cancelled', decided_at=? WHERE company_id=? AND phone=? AND status='pending'").run(now(), c.id, req.phone)
  db.prepare('DELETE FROM phone_company_links WHERE phone=? AND company_id=?').run(req.phone, c.id)
  logEvent({ type: 'cancel_reservation', company_id: c.id, company_name: c.name, actor: req.phone, from_status: 'reserved', to_status: 'open' })
  res.json({ ok: true })
})

// similar entities to suggest after a reservation (same sector/affiliation first, then same type)
app.get('/api/companies/:id/similar', (req, res) => {
  const c = db.prepare('SELECT * FROM agencies WHERE id = ? AND approved = 1').get(req.params.id)
  if (!c) return res.status(404).json({ error: 'الجهة غير موجودة' })
  const seen = new Set([c.id])
  const rows = []
  if (c.category) {
    const r = db.prepare("SELECT * FROM agencies WHERE approved = 1 AND status = 'open' AND category = ? AND id != ? ORDER BY name LIMIT 6").all(c.category, c.id)
    for (const x of r) { rows.push(x); seen.add(x.id) }
  }
  if (rows.length < 6) {
    const r = db.prepare("SELECT * FROM agencies WHERE approved = 1 AND status = 'open' AND type = ? AND id != ? ORDER BY name LIMIT 20").all(c.type, c.id)
    for (const x of r) {
      if (!seen.has(x.id) && rows.length < 6) { rows.push(x); seen.add(x.id) }
    }
  }
  res.json(rows.map(publicCompany))
})

// user gives us the concerned person's number -> Aktham will reach out
app.post('/api/companies/:id/lead', phoneAuth, (req, res) => {
  const lead = onlyDigits(req.body?.phone)
  if (lead.length < 7) return res.status(400).json({ error: 'رقم غير صحيح' })
  const r = db
    .prepare("SELECT * FROM reservations WHERE company_id=? AND phone=? AND status='pending' ORDER BY id DESC LIMIT 1")
    .get(req.params.id, req.phone)
  if (r) db.prepare('UPDATE reservations SET lead_phone=? WHERE id=?').run(lead, r.id)
  else
    db.prepare(
      "INSERT INTO reservations (company_id, phone, message, status, created_at, lead_phone) VALUES (?, ?, '', 'pending', ?, ?)",
    ).run(req.params.id, req.phone, now(), lead)
  logEvent({ type: 'lead', company_id: Number(req.params.id), company_name: getCompanyName(req.params.id), actor: req.phone, meta: { lead_phone: lead } })
  res.json({ ok: true })
})

// optional free-text comment attached to the user's reservation
app.post('/api/companies/:id/comment', phoneAuth, (req, res) => {
  const comment = String(req.body?.comment || '').trim()
  const r = db
    .prepare("SELECT * FROM reservations WHERE company_id=? AND phone=? AND status='pending' ORDER BY id DESC LIMIT 1")
    .get(req.params.id, req.phone)
  if (r) db.prepare('UPDATE reservations SET comment=? WHERE id=?').run(comment, r.id)
  else
    db.prepare(
      "INSERT INTO reservations (company_id, phone, message, status, created_at, comment) VALUES (?, ?, '', 'pending', ?, ?)",
    ).run(req.params.id, req.phone, now(), comment)
  logEvent({ type: 'comment', company_id: Number(req.params.id), company_name: getCompanyName(req.params.id), actor: req.phone, meta: { comment } })
  res.json({ ok: true })
})

app.post('/api/companies/submit', phoneAuth, (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'اسم الجهة مطلوب' })
  // duplicate detection: if an entity with a very similar name exists, return it
  if (!req.body?.force) {
    const norm = (s) => s.replace(/[ً-ْـ]/g, '').replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').replace(/\s+/g, '')
    const target = norm(name)
    const existing = db
      .prepare('SELECT id, name, status, type, approved FROM agencies')
      .all()
      .find((a) => {
        const n = norm(a.name)
        return n === target || n.includes(target) || target.includes(n)
      })
    if (existing) {
      return res.json({ exists: true, company: existing })
    }
  }
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM agencies').get().m
  const info = db
    .prepare(
      `INSERT INTO agencies (name, sort_order, category, status, approved, submitted_by)
       VALUES (?, ?, ?, 'open', 0, ?)`,
    )
    .run(name, maxOrder + 1, String(req.body?.category || '').trim(), req.phone)
  logEvent({ type: 'submitted', company_id: info.lastInsertRowid, company_name: name, actor: req.phone })
  res.status(201).json({ ok: true, id: info.lastInsertRowid, pending: true })
})

app.get('/api/me/companies', phoneAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT DISTINCT a.* FROM agencies a
       LEFT JOIN phone_company_links l ON l.company_id = a.id
       WHERE (l.phone = ? OR a.reserved_by = ? OR a.submitted_by = ?)
       ORDER BY a.sort_order ASC, a.id ASC`,
    )
    .all(req.phone, req.phone, req.phone)
  res.json(rows.map(publicCompany))
})

// ============================================================
//  ADMIN: companies CRUD
// ============================================================
app.post('/api/agencies', adminAuth, companyUpload, (req, res) => {
  const { name, short = '', url = '#', category = '', profile = '', contact_phone = '', status = 'open', type = 'company' } = req.body || {}
  if (!name || !name.trim()) return res.status(400).json({ error: 'الاسم مطلوب' })
  const logo = fileUrl(req.files?.logoFile?.[0]) || req.body.logo || ''
  const profileFile = fileUrl(req.files?.profileFile?.[0]) || req.body.profile_file || ''
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM agencies').get().m
  const info = db
    .prepare(
      `INSERT INTO agencies (name, short, logo, url, sort_order, category, profile, contact_phone, status, profile_file, type, approved)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    )
    .run(name.trim(), short, logo, url || '#', maxOrder + 1, category, profile, contact_phone, status, profileFile, type)
  res.status(201).json(db.prepare('SELECT * FROM agencies WHERE id = ?').get(info.lastInsertRowid))
})

app.put('/api/agencies/:id', adminAuth, companyUpload, (req, res) => {
  const e = db.prepare('SELECT * FROM agencies WHERE id = ?').get(req.params.id)
  if (!e) return res.status(404).json({ error: 'غير موجودة' })
  const name = (req.body.name ?? e.name).trim()
  if (!name) return res.status(400).json({ error: 'الاسم مطلوب' })
  const logo = fileUrl(req.files?.logoFile?.[0]) || (req.body.logo ?? e.logo)
  const profileFile = fileUrl(req.files?.profileFile?.[0]) || (req.body.profile_file ?? e.profile_file)
  // attrition_rate: empty string clears it (null); otherwise clamp 0–100
  let attrition = e.attrition_rate
  if (req.body.attrition_rate !== undefined) {
    const raw = String(req.body.attrition_rate).trim()
    attrition = raw === '' ? null : Math.max(0, Math.min(100, Math.round(Number(raw)) || 0))
  }
  db.prepare(
    `UPDATE agencies SET name=?, name_en=?, short=?, logo=?, url=?, category=?, profile=?, contact_phone=?, status=?, profile_file=?, type=?, attrition_rate=? WHERE id=?`,
  ).run(
    name,
    req.body.name_en ?? e.name_en,
    req.body.short ?? e.short,
    logo,
    (req.body.url ?? e.url) || '#',
    req.body.category ?? e.category,
    req.body.profile ?? e.profile,
    req.body.contact_phone ?? e.contact_phone,
    req.body.status ?? e.status,
    profileFile,
    req.body.type ?? e.type,
    attrition,
    req.params.id,
  )
  const newStatus = req.body.status ?? e.status
  if (newStatus !== e.status) {
    logEvent({
      type: newStatus === 'completed' ? 'completed' : 'status_change',
      company_id: Number(req.params.id), company_name: name,
      actor: req.admin?.email || 'admin', from_status: e.status, to_status: newStatus,
    })
  }
  res.json(db.prepare('SELECT * FROM agencies WHERE id = ?').get(req.params.id))
})

app.delete('/api/agencies/:id', adminAuth, (req, res) => {
  const info = db.prepare('DELETE FROM agencies WHERE id = ?').run(req.params.id)
  if (!info.changes) return res.status(404).json({ error: 'غير موجودة' })
  res.json({ ok: true })
})

// admin sees everything (including unapproved + contact phone)
app.get('/api/admin/companies', adminAuth, (_req, res) => {
  res.json(db.prepare('SELECT * FROM agencies ORDER BY sort_order ASC, id ASC').all())
})

app.get('/api/admin/pending-companies', adminAuth, (_req, res) => {
  res.json(db.prepare('SELECT * FROM agencies WHERE approved = 0 ORDER BY id DESC').all())
})

app.post('/api/admin/companies/:id/approve', adminAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM agencies WHERE id = ?').get(req.params.id)
  if (!c) return res.status(404).json({ error: 'غير موجودة' })
  db.prepare('UPDATE agencies SET approved = 1 WHERE id = ?').run(c.id)
  const msg = `تمت الموافقة على إضافة شركتك "${c.name}" في منصة أكثم. رمز التحقق الخاص بك جاهز.`
  res.json({ ok: true, verifyWhatsappLink: c.submitted_by ? waLink(c.submitted_by, msg) : '' })
})

app.post('/api/admin/companies/:id/status', adminAuth, (req, res) => {
  const status = req.body?.status
  if (!['open', 'reserved', 'claimed', 'completed'].includes(status)) {
    return res.status(400).json({ error: 'حالة غير صحيحة' })
  }
  const prev = db.prepare('SELECT name, status FROM agencies WHERE id = ?').get(req.params.id)
  const clearOwner = status === 'open'
  db.prepare(`UPDATE agencies SET status=?${clearOwner ? ", reserved_by=''" : ''} WHERE id=?`).run(
    status, req.params.id,
  )
  logEvent({
    type: status === 'completed' ? 'completed' : 'status_change',
    company_id: Number(req.params.id), company_name: prev?.name || '',
    actor: req.admin?.email || 'admin', from_status: prev?.status || '', to_status: status,
  })
  res.json(db.prepare('SELECT * FROM agencies WHERE id = ?').get(req.params.id))
})

app.post('/api/admin/companies/:id/deadline', adminAuth, (req, res) => {
  const deadline = req.body?.deadline ? Number(req.body.deadline) : null
  db.prepare('UPDATE agencies SET reserve_deadline = ? WHERE id = ?').run(deadline, req.params.id)
  res.json(db.prepare('SELECT * FROM agencies WHERE id = ?').get(req.params.id))
})

function assignCompany(phone, companyId) {
  db.prepare('INSERT OR IGNORE INTO phone_company_links (phone, company_id) VALUES (?, ?)').run(phone, companyId)
  // linking marks it reserved by this user (status updates) if it was available
  db.prepare("UPDATE agencies SET status='reserved', reserved_by=? WHERE id=? AND status='open'").run(phone, companyId)
  logEvent({ type: 'assigned', company_id: companyId, company_name: getCompanyName(companyId), actor: 'admin', to_status: 'reserved', meta: { user: phone } })
}
function unassignCompany(phone, companyId) {
  db.prepare('DELETE FROM phone_company_links WHERE phone = ? AND company_id = ?').run(phone, companyId)
  const remaining = db.prepare('SELECT COUNT(*) AS c FROM phone_company_links WHERE company_id = ?').get(companyId).c
  if (remaining === 0) {
    db.prepare("UPDATE agencies SET status='open', reserved_by='' WHERE id=? AND reserved_by=?").run(companyId, phone)
  }
  logEvent({ type: 'unassigned', company_id: companyId, company_name: getCompanyName(companyId), actor: 'admin', meta: { user: phone } })
}

app.post('/api/admin/companies/:id/assign', adminAuth, (req, res) => {
  const phone = onlyDigits(req.body?.phone)
  if (!phone) return res.status(400).json({ error: 'رقم الجوال مطلوب' })
  assignCompany(phone, Number(req.params.id))
  res.json({ ok: true })
})

app.post('/api/admin/companies/:id/unassign', adminAuth, (req, res) => {
  unassignCompany(onlyDigits(req.body?.phone), Number(req.params.id))
  res.json({ ok: true })
})

app.get('/api/admin/companies/:id/assignments', adminAuth, (req, res) => {
  res.json(
    db.prepare('SELECT phone FROM phone_company_links WHERE company_id = ?').all(req.params.id).map((r) => r.phone),
  )
})

// user-centric assignment (link entities to a user from the users list)
app.get('/api/admin/users/:phone/companies', adminAuth, (req, res) => {
  const phone = onlyDigits(req.params.phone)
  const ids = db.prepare('SELECT company_id FROM phone_company_links WHERE phone = ?').all(phone).map((r) => r.company_id)
  res.json(ids)
})
app.post('/api/admin/users/:phone/assign', adminAuth, (req, res) => {
  const phone = onlyDigits(req.params.phone)
  assignCompany(phone, Number(req.body?.company_id))
  res.json({ ok: true })
})
app.post('/api/admin/users/:phone/unassign', adminAuth, (req, res) => {
  const phone = onlyDigits(req.params.phone)
  unassignCompany(phone, Number(req.body?.company_id))
  res.json({ ok: true })
})

// ============================================================
//  ADMIN: reservations queue
// ============================================================
app.get('/api/admin/reservations', adminAuth, (req, res) => {
  const status = req.query.status
  const base =
    `SELECT r.*, a.name AS company_name, a.logo AS company_logo, pu.name AS requester_name
     FROM reservations r
     JOIN agencies a ON a.id = r.company_id
     LEFT JOIN phone_users pu ON pu.phone = r.phone`
  const rows = status
    ? db.prepare(base + ' WHERE r.status = ? ORDER BY r.created_at DESC').all(status)
    : db.prepare(base + ' ORDER BY r.created_at DESC').all()
  res.json(rows)
})

app.post('/api/admin/reservations/:id/approve', adminAuth, (req, res) => {
  const r = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id)
  if (!r) return res.status(404).json({ error: 'الطلب غير موجود' })
  db.prepare("UPDATE reservations SET status='approved', decided_at=? WHERE id=?").run(now(), r.id)
  db.prepare("UPDATE agencies SET status='reserved', reserved_by=? WHERE id=?").run(r.phone, r.company_id)
  const c = db.prepare('SELECT * FROM agencies WHERE id = ?').get(r.company_id)
  logEvent({ type: 'reservation_approved', company_id: r.company_id, company_name: c?.name || '', actor: req.admin?.email || 'admin', to_status: 'reserved', meta: { requester: r.phone } })
  const tpl = getSetting('approve_template', 'تم قبول حجزك لجهة «{company}». سنتواصل معك لإتمام الإجراءات.')
  const msg = tpl.replace(/\{company\}/g, c?.name || '').replace(/\{name\}/g, getName(r.phone) || '')
  res.json({ ok: true, notifyWhatsappLink: waLink(r.phone, msg), message: msg })
})

app.post('/api/admin/reservations/:id/reject', adminAuth, (req, res) => {
  const r = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id)
  if (!r) return res.status(404).json({ error: 'الطلب غير موجود' })
  db.prepare("UPDATE reservations SET status='rejected', decided_at=? WHERE id=?").run(now(), r.id)
  // only reopen if still held by this requester
  db.prepare("UPDATE agencies SET status='open', reserved_by='' WHERE id=? AND reserved_by=?").run(
    r.company_id, r.phone,
  )
  logEvent({ type: 'reservation_rejected', company_id: r.company_id, company_name: getCompanyName(r.company_id), actor: req.admin?.email || 'admin', to_status: 'open', meta: { requester: r.phone } })
  res.json({ ok: true })
})

// ============================================================
//  ADMIN: access control (allowlist + pending requests)
// ============================================================
app.get('/api/admin/access', adminAuth, (req, res) => {
  const status = req.query.status
  const rows = status
    ? db.prepare('SELECT phone, name, nickname, status, created_at FROM phone_users WHERE status = ? ORDER BY created_at DESC').all(status)
    : db.prepare('SELECT phone, name, nickname, status, created_at FROM phone_users ORDER BY created_at DESC').all()
  res.json(rows)
})

// admin pre-adds (or renames) an approved number with a name + nickname
app.post('/api/admin/access', adminAuth, (req, res) => {
  const phone = onlyDigits(req.body?.phone)
  const name = String(req.body?.name || '').trim()
  const nickname = String(req.body?.nickname || '').trim()
  if (phone.length < 7) return res.status(400).json({ error: 'رقم غير صحيح' })
  setPhoneUser(phone, 'approved', name, nickname)
  res.status(201).json({ ok: true })
})

// approve a pending request -> returns a WhatsApp link to notify the user
app.post('/api/admin/access/:phone/approve', adminAuth, (req, res) => {
  const phone = onlyDigits(req.params.phone)
  setPhoneUser(phone, 'approved')
  const tpl = getSetting('activate_template', 'تم تفعيل رقمك في منصة أكثم. يمكنك الآن تسجيل الدخول.')
  const msg = tpl.replace(/\{name\}/g, getName(phone) || '')
  res.json({ ok: true, notifyWhatsappLink: waLink(phone, msg), message: msg })
})

app.post('/api/admin/access/:phone/reject', adminAuth, (req, res) => {
  db.prepare('DELETE FROM phone_users WHERE phone = ?').run(onlyDigits(req.params.phone))
  res.json({ ok: true })
})

app.delete('/api/admin/access/:phone', adminAuth, (req, res) => {
  db.prepare('DELETE FROM phone_users WHERE phone = ?').run(onlyDigits(req.params.phone))
  res.json({ ok: true })
})

// ============================================================
//  ADMIN: monitoring dashboard stats
// ============================================================
app.get('/api/admin/stats', adminAuth, (_req, res) => {
  const countBy = (col) =>
    Object.fromEntries(
      db.prepare(`SELECT ${col} AS k, COUNT(*) AS c FROM agencies WHERE approved = 1 GROUP BY ${col}`).all().map((r) => [r.k, r.c]),
    )
  const byStatus = countBy('status')
  const byType = countBy('type')
  const bySector = db
    .prepare("SELECT category AS sector, COUNT(*) AS count FROM agencies WHERE approved = 1 AND type='company' AND category<>'' GROUP BY category ORDER BY count DESC")
    .all()
  const totals = {
    entities: db.prepare('SELECT COUNT(*) AS c FROM agencies WHERE approved = 1').get().c,
    users: db.prepare("SELECT COUNT(*) AS c FROM phone_users WHERE status='approved'").get().c,
    pendingUsers: db.prepare("SELECT COUNT(*) AS c FROM phone_users WHERE status='pending'").get().c,
    reservations: db.prepare("SELECT COUNT(*) AS c FROM reservations WHERE status='pending'").get().c,
    pendingCompanies: db.prepare('SELECT COUNT(*) AS c FROM agencies WHERE approved = 0').get().c,
    reservedEntities: db.prepare("SELECT COUNT(*) AS c FROM agencies WHERE approved = 1 AND status='reserved'").get().c,
  }
  const recent = db
    .prepare(
      `SELECT r.id, r.phone, r.lead_phone, r.comment, r.status, r.created_at,
              a.name AS company_name, pu.name AS requester_name, pu.nickname AS requester_nick
       FROM reservations r
       JOIN agencies a ON a.id = r.company_id
       LEFT JOIN phone_users pu ON pu.phone = r.phone
       ORDER BY r.id DESC LIMIT 50`,
    )
    .all()
  // currently reserved entities (with the user who holds them + the deadline)
  const reservedList = db
    .prepare(
      `SELECT a.id, a.name, a.logo, a.reserved_by, a.reserve_deadline,
              pu.name AS user_name, pu.nickname AS user_nick
       FROM agencies a
       LEFT JOIN phone_users pu ON pu.phone = a.reserved_by
       WHERE a.approved = 1 AND a.status = 'reserved'
       ORDER BY a.reserve_deadline ASC NULLS LAST, a.name ASC`,
    )
    .all()
  res.json({ byStatus, byType, bySector, totals, recent, reservedList })
})

// ============================================================
//  ADMIN: sales analytics (event log + averages)
// ============================================================
app.get('/api/admin/analytics', adminAuth, (_req, res) => {
  const DAY = 86400000

  // event counts by type
  const eventCounts = Object.fromEntries(
    db.prepare('SELECT type AS k, COUNT(*) AS c FROM events GROUP BY type').all().map((r) => [r.k, r.c]),
  )

  // current entity status distribution
  const byStatus = Object.fromEntries(
    db.prepare("SELECT status AS k, COUNT(*) AS c FROM agencies WHERE approved = 1 GROUP BY status").all().map((r) => [r.k, r.c]),
  )

  // reservation funnel + decision timing (from the reservations table)
  const resTotals = {
    total: db.prepare('SELECT COUNT(*) AS c FROM reservations').get().c,
    approved: db.prepare("SELECT COUNT(*) AS c FROM reservations WHERE status='approved'").get().c,
    rejected: db.prepare("SELECT COUNT(*) AS c FROM reservations WHERE status='rejected'").get().c,
    pending: db.prepare("SELECT COUNT(*) AS c FROM reservations WHERE status='pending'").get().c,
  }
  const avgDecisionMs = db
    .prepare("SELECT AVG(decided_at - created_at) AS a FROM reservations WHERE decided_at IS NOT NULL AND decided_at > created_at")
    .get().a || 0

  // average time reserved -> completed, computed per entity from the event log
  // (first 'reserve'/'reservation_approved'/'assigned' time vs first 'completed' time)
  const reservedAt = db
    .prepare("SELECT company_id, MIN(created_at) AS t FROM events WHERE type IN ('reserve','reservation_approved','assigned') AND company_id IS NOT NULL GROUP BY company_id")
    .all()
  const completedAt = Object.fromEntries(
    db.prepare("SELECT company_id, MIN(created_at) AS t FROM events WHERE type='completed' AND company_id IS NOT NULL GROUP BY company_id").all().map((r) => [r.company_id, r.t]),
  )
  const durations = []
  for (const r of reservedAt) {
    const ct = completedAt[r.company_id]
    if (ct && ct > r.t) durations.push(ct - r.t)
  }
  const avgReserveToCompleteMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0

  // daily activity for the last 30 days (reserve + completed counts)
  const since = now() - 30 * DAY
  const daily = db
    .prepare(
      `SELECT (created_at / ${DAY}) AS day, type, COUNT(*) AS c
       FROM events WHERE created_at >= ? AND type IN ('reserve','completed','lead','reservation_approved')
       GROUP BY day, type ORDER BY day ASC`,
    )
    .all(since)

  res.json({
    eventCounts,
    byStatus,
    resTotals,
    avgDecisionMs,
    avgReserveToCompleteMs,
    completedCount: byStatus.completed || 0,
    daily,
    eventsTotal: db.prepare('SELECT COUNT(*) AS c FROM events').get().c,
  })
})

// recent raw events (for the activity feed)
app.get('/api/admin/events', adminAuth, (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100))
  res.json(db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT ?').all(limit))
})

// full event log as CSV (one-click export for sales analysis)
app.get('/api/admin/events.csv', adminAuth, (_req, res) => {
  const rows = db.prepare('SELECT id, type, company_id, company_name, actor, from_status, to_status, meta, created_at FROM events ORDER BY id ASC').all()
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = ['id', 'type', 'company_id', 'company_name', 'actor', 'from_status', 'to_status', 'meta', 'created_at', 'datetime']
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push([r.id, r.type, r.company_id, r.company_name, r.actor, r.from_status, r.to_status, r.meta, r.created_at, new Date(r.created_at).toISOString()].map(esc).join(','))
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="aktham-events-${new Date().toISOString().slice(0, 10)}.csv"`)
  res.send('﻿' + lines.join('\n'))
})

// ============================================================
//  ADMIN: settings (editable intro) + layered profile files
// ============================================================
app.get('/api/admin/settings', adminAuth, (_req, res) => {
  res.json({
    intro_message: getSetting('intro_message', DEFAULT_INTRO),
    default_profile_file: getSetting('default_profile_file', DEFAULT_PROFILE),
    approve_template: getSetting('approve_template', ''),
    activate_template: getSetting('activate_template', ''),
    high_attrition_threshold: getSetting('high_attrition_threshold', '20'),
  })
})

app.post('/api/admin/settings', adminAuth, (req, res) => {
  for (const k of ['intro_message', 'approve_template', 'activate_template']) {
    if (typeof req.body?.[k] === 'string') setSetting(k, req.body[k])
  }
  if (req.body?.high_attrition_threshold !== undefined) {
    const n = Math.max(0, Math.min(100, Math.round(Number(req.body.high_attrition_threshold)) || 0))
    setSetting('high_attrition_threshold', String(n))
  }
  res.json({ ok: true, intro_message: getSetting('intro_message', DEFAULT_INTRO) })
})

// upload/replace the GLOBAL default profile -> applies to all companies without an override
app.post('/api/admin/default-profile', adminAuth, upload.single('profileFile'), (req, res) => {
  if (req.file) setSetting('default_profile_file', fileUrl(req.file))
  else if (req.body?.default_profile_file) setSetting('default_profile_file', req.body.default_profile_file)
  res.json({ ok: true, default_profile_file: getSetting('default_profile_file', DEFAULT_PROFILE) })
})

app.get('/api/admin/category-profiles', adminAuth, (_req, res) => {
  res.json(db.prepare('SELECT category, profile_file FROM category_profiles ORDER BY category').all())
})

app.post('/api/admin/category-profiles', adminAuth, upload.single('profileFile'), (req, res) => {
  const category = String(req.body?.category || '').trim()
  if (!category) return res.status(400).json({ error: 'القطاع مطلوب' })
  const pf = req.file ? fileUrl(req.file) : req.body?.profile_file || ''
  db.prepare(
    'INSERT INTO category_profiles (category, profile_file) VALUES (?, ?) ON CONFLICT(category) DO UPDATE SET profile_file = excluded.profile_file',
  ).run(category, pf)
  res.json({ ok: true })
})

app.delete('/api/admin/category-profiles/:category', adminAuth, (req, res) => {
  db.prepare('DELETE FROM category_profiles WHERE category = ?').run(req.params.category)
  res.json({ ok: true })
})

// ============================================================
//  ADMIN: admin accounts
// ============================================================
app.get('/api/admin/admins', adminAuth, (_req, res) => {
  res.json(db.prepare('SELECT id, email FROM users ORDER BY id ASC').all())
})

app.post('/api/admin/admins', adminAuth, (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'بريد إلكتروني غير صحيح' })
  if (password.length < 8) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'هذا البريد مسجّل مسبقاً' })
  const info = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, bcrypt.hashSync(password, 10))
  res.status(201).json({ id: info.lastInsertRowid, email })
})

app.delete('/api/admin/admins/:id', adminAuth, (req, res) => {
  const id = Number(req.params.id)
  if (id === req.admin.id) return res.status(400).json({ error: 'لا يمكنك حذف حسابك الحالي' })
  if (db.prepare('SELECT COUNT(*) AS c FROM users').get().c <= 1) return res.status(400).json({ error: 'يجب الإبقاء على حساب مسؤول واحد على الأقل' })
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
  res.json({ ok: true })
})

// ============================================================
//  ADMIN: WhatsApp message templates
// ============================================================
app.get('/api/admin/templates', adminAuth, (_req, res) => {
  res.json(db.prepare('SELECT * FROM templates ORDER BY id DESC').all())
})

app.post('/api/admin/templates', adminAuth, (req, res) => {
  const { title, body } = req.body || {}
  if (!title || !body) return res.status(400).json({ error: 'العنوان والنص مطلوبان' })
  const info = db
    .prepare('INSERT INTO templates (title, body, created_at) VALUES (?, ?, ?)')
    .run(title, body, now())
  res.status(201).json(db.prepare('SELECT * FROM templates WHERE id = ?').get(info.lastInsertRowid))
})

app.delete('/api/admin/templates/:id', adminAuth, (req, res) => {
  db.prepare('DELETE FROM templates WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// build a wa.me link for any phone + template body (admin convenience)
app.post('/api/admin/whatsapp-link', adminAuth, (req, res) => {
  const { phone, body } = req.body || {}
  res.json({ link: waLink(phone, body || '') })
})

// ---------- static ----------
app.use('/uploads', express.static(UPLOAD_DIR))

if (process.env.NODE_ENV === 'production') {
  const dist = path.join(ROOT, 'dist')
  // hashed assets cache forever; index.html must always revalidate so clients
  // pick up new asset references immediately after a deploy.
  app.use(
    express.static(dist, {
      setHeaders: (res, p) => {
        if (p.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache')
        else if (/\/assets\//.test(p)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      },
    }),
  )
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(path.join(dist, 'index.html'))
  })
}

app.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT} (otp=${OTP_MODE})`))
