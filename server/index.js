import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import twilio from 'twilio'
import { db, seed } from './db.js'

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
function setPhoneUser(phone, status) {
  const u = db.prepare('SELECT 1 FROM phone_users WHERE phone = ?').get(phone)
  if (u) db.prepare('UPDATE phone_users SET status = ? WHERE phone = ?').run(status, phone)
  else db.prepare('INSERT INTO phone_users (phone, name, created_at, status) VALUES (?, ?, ?, ?)').run(phone, '', now(), status)
}
// record an access request for an unknown number (does not downgrade existing users)
function recordPending(phone) {
  const u = db.prepare('SELECT 1 FROM phone_users WHERE phone = ?').get(phone)
  if (!u) db.prepare("INSERT INTO phone_users (phone, name, created_at, status) VALUES (?, '', ?, 'pending')").run(phone, now())
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
  if (phone.length < 7) return res.status(400).json({ error: 'رقم جوال غير صحيح' })

  // allowlist gate: unknown/not-approved numbers become a pending request (no access yet)
  if (blockedByAllowlist(phone)) {
    recordPending(phone)
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
    setPhoneUser(phone, 'approved')
    return res.json({ ok: true, token: sign({ type: 'phone', phone }), phone, skipVerify: true })
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
    recordPending(phone)
    return res.status(403).json({ pending: true, error: 'رقمك بانتظار موافقة الإدارة' })
  }
  setPhoneUser(phone, 'approved')
  res.json({ token: sign({ type: 'phone', phone }), phone })
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

app.get('/api/companies/categories', (_req, res) => {
  const rows = db
    .prepare("SELECT DISTINCT category FROM agencies WHERE approved = 1 AND category <> '' ORDER BY category")
    .all()
  res.json(rows.map((r) => r.category))
})

app.get('/api/companies/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM agencies WHERE id = ? AND approved = 1').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'الشركة غير موجودة' })
  res.json(publicCompany(row))
})

// ============================================================
//  USER ACTIONS (phone auth)
// ============================================================
const DEFAULT_HOLD_MS = 48 * 60 * 60 * 1000

app.post('/api/companies/:id/reserve', phoneAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM agencies WHERE id = ? AND approved = 1').get(req.params.id)
  if (!c) return res.status(404).json({ error: 'الشركة غير موجودة' })
  if (c.status === 'claimed' || c.status === 'completed') {
    return res.status(409).json({ error: 'هذه الشركة غير متاحة للحجز حالياً' })
  }
  const deadline = c.reserve_deadline || now() + DEFAULT_HOLD_MS
  db.prepare("UPDATE agencies SET status='reserved', reserved_by=?, reserve_deadline=? WHERE id=?").run(
    req.phone, deadline, c.id,
  )
  const info = db.prepare(
    'INSERT INTO reservations (company_id, phone, message, status, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(c.id, req.phone, req.body?.message || '', 'pending', now())

  const premade = `مرحباً، أنا مهتم بشركة "${c.name}" وأرغب في حجزها. هذا رقمي: ${req.phone}`
  res.json({
    ok: true,
    reservationId: info.lastInsertRowid,
    company: publicCompany({ ...c, status: 'reserved' }),
    contact_phone: c.contact_phone,
    profile_file: c.profile_file,
    premadeMessage: premade,
    whatsappLink: c.contact_phone ? waLink(c.contact_phone, premade) : '',
    deadline,
  })
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
  res.json({ ok: true })
})

app.post('/api/companies/submit', phoneAuth, (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'اسم الشركة مطلوب' })
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM agencies').get().m
  const info = db
    .prepare(
      `INSERT INTO agencies (name, sort_order, category, status, approved, submitted_by)
       VALUES (?, ?, ?, 'open', 0, ?)`,
    )
    .run(name, maxOrder + 1, String(req.body?.category || '').trim(), req.phone)
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
  const { name, short = '', url = '#', category = '', profile = '', contact_phone = '', status = 'open' } = req.body || {}
  if (!name || !name.trim()) return res.status(400).json({ error: 'الاسم مطلوب' })
  const logo = fileUrl(req.files?.logoFile?.[0]) || req.body.logo || ''
  const profileFile = fileUrl(req.files?.profileFile?.[0]) || req.body.profile_file || ''
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM agencies').get().m
  const info = db
    .prepare(
      `INSERT INTO agencies (name, short, logo, url, sort_order, category, profile, contact_phone, status, profile_file, approved)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    )
    .run(name.trim(), short, logo, url || '#', maxOrder + 1, category, profile, contact_phone, status, profileFile)
  res.status(201).json(db.prepare('SELECT * FROM agencies WHERE id = ?').get(info.lastInsertRowid))
})

app.put('/api/agencies/:id', adminAuth, companyUpload, (req, res) => {
  const e = db.prepare('SELECT * FROM agencies WHERE id = ?').get(req.params.id)
  if (!e) return res.status(404).json({ error: 'غير موجودة' })
  const name = (req.body.name ?? e.name).trim()
  if (!name) return res.status(400).json({ error: 'الاسم مطلوب' })
  const logo = fileUrl(req.files?.logoFile?.[0]) || (req.body.logo ?? e.logo)
  const profileFile = fileUrl(req.files?.profileFile?.[0]) || (req.body.profile_file ?? e.profile_file)
  db.prepare(
    `UPDATE agencies SET name=?, short=?, logo=?, url=?, category=?, profile=?, contact_phone=?, status=?, profile_file=? WHERE id=?`,
  ).run(
    name,
    req.body.short ?? e.short,
    logo,
    (req.body.url ?? e.url) || '#',
    req.body.category ?? e.category,
    req.body.profile ?? e.profile,
    req.body.contact_phone ?? e.contact_phone,
    req.body.status ?? e.status,
    profileFile,
    req.params.id,
  )
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
  const clearOwner = status === 'open'
  db.prepare(`UPDATE agencies SET status=?${clearOwner ? ", reserved_by=''" : ''} WHERE id=?`).run(
    status, req.params.id,
  )
  res.json(db.prepare('SELECT * FROM agencies WHERE id = ?').get(req.params.id))
})

app.post('/api/admin/companies/:id/deadline', adminAuth, (req, res) => {
  const deadline = req.body?.deadline ? Number(req.body.deadline) : null
  db.prepare('UPDATE agencies SET reserve_deadline = ? WHERE id = ?').run(deadline, req.params.id)
  res.json(db.prepare('SELECT * FROM agencies WHERE id = ?').get(req.params.id))
})

app.post('/api/admin/companies/:id/assign', adminAuth, (req, res) => {
  const phone = onlyDigits(req.body?.phone)
  if (!phone) return res.status(400).json({ error: 'رقم الجوال مطلوب' })
  db.prepare('INSERT OR IGNORE INTO phone_company_links (phone, company_id) VALUES (?, ?)').run(
    phone, req.params.id,
  )
  res.json({ ok: true })
})

app.post('/api/admin/companies/:id/unassign', adminAuth, (req, res) => {
  db.prepare('DELETE FROM phone_company_links WHERE phone = ? AND company_id = ?').run(
    onlyDigits(req.body?.phone), req.params.id,
  )
  res.json({ ok: true })
})

app.get('/api/admin/companies/:id/assignments', adminAuth, (req, res) => {
  res.json(
    db.prepare('SELECT phone FROM phone_company_links WHERE company_id = ?').all(req.params.id).map((r) => r.phone),
  )
})

// ============================================================
//  ADMIN: reservations queue
// ============================================================
app.get('/api/admin/reservations', adminAuth, (req, res) => {
  const status = req.query.status
  const base =
    `SELECT r.*, a.name AS company_name, a.logo AS company_logo FROM reservations r
     JOIN agencies a ON a.id = r.company_id`
  const rows = status
    ? db.prepare(base + ' WHERE r.status = ? ORDER BY r.created_at DESC').all(status)
    : db.prepare(base + ' ORDER BY r.created_at DESC').all()
  res.json(rows)
})

app.post('/api/admin/reservations/:id/approve', adminAuth, (req, res) => {
  const r = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id)
  if (!r) return res.status(404).json({ error: 'الطلب غير موجود' })
  db.prepare("UPDATE reservations SET status='approved', decided_at=? WHERE id=?").run(now(), r.id)
  db.prepare("UPDATE agencies SET status='claimed', reserved_by=? WHERE id=?").run(r.phone, r.company_id)
  const c = db.prepare('SELECT * FROM agencies WHERE id = ?').get(r.company_id)
  const msg = `تم قبول حجزك لشركة "${c?.name}". سنتواصل معك لإتمام الإجراءات.`
  res.json({ ok: true, notifyWhatsappLink: waLink(r.phone, msg) })
})

app.post('/api/admin/reservations/:id/reject', adminAuth, (req, res) => {
  const r = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id)
  if (!r) return res.status(404).json({ error: 'الطلب غير موجود' })
  db.prepare("UPDATE reservations SET status='rejected', decided_at=? WHERE id=?").run(now(), r.id)
  // only reopen if still held by this requester
  db.prepare("UPDATE agencies SET status='open', reserved_by='' WHERE id=? AND reserved_by=?").run(
    r.company_id, r.phone,
  )
  res.json({ ok: true })
})

// ============================================================
//  ADMIN: access control (allowlist + pending requests)
// ============================================================
app.get('/api/admin/access', adminAuth, (req, res) => {
  const status = req.query.status
  const rows = status
    ? db.prepare('SELECT phone, status, created_at FROM phone_users WHERE status = ? ORDER BY created_at DESC').all(status)
    : db.prepare('SELECT phone, status, created_at FROM phone_users ORDER BY created_at DESC').all()
  res.json(rows)
})

// admin pre-adds an approved number
app.post('/api/admin/access', adminAuth, (req, res) => {
  const phone = onlyDigits(req.body?.phone)
  if (phone.length < 7) return res.status(400).json({ error: 'رقم غير صحيح' })
  setPhoneUser(phone, 'approved')
  res.status(201).json({ ok: true })
})

// approve a pending request -> returns a WhatsApp link to notify the user
app.post('/api/admin/access/:phone/approve', adminAuth, (req, res) => {
  const phone = onlyDigits(req.params.phone)
  setPhoneUser(phone, 'approved')
  const msg = 'تم تفعيل رقمك في منصة أكثم. يمكنك الآن تسجيل الدخول والاطلاع على قائمتك.'
  res.json({ ok: true, notifyWhatsappLink: waLink(phone, msg) })
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
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT} (otp=${OTP_MODE})`))
