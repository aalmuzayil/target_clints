import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { db, seed } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(ROOT, 'data', 'uploads')
const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me'
const PORT = process.env.PORT || 3001

fs.mkdirSync(UPLOAD_DIR, { recursive: true })
seed()

const app = express()
app.use(express.json())

// ---- file uploads ----
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png'
    cb(null, `logo-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`)
  },
})
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, /^image\//.test(file.mimetype))
  },
})

// ---- auth ----
function auth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'مطلوب تسجيل الدخول' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'جلسة غير صالحة' })
  }
}

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'البريد وكلمة المرور مطلوبان' })
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase())
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' })
  }
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' })
  res.json({ token, email: user.email })
})

// ---- agencies CRUD ----
app.get('/api/agencies', (_req, res) => {
  const rows = db.prepare('SELECT * FROM agencies ORDER BY sort_order ASC, id ASC').all()
  res.json(rows)
})

app.post('/api/agencies', auth, upload.single('logoFile'), (req, res) => {
  const { name, short = '', url = '#' } = req.body || {}
  if (!name || !name.trim()) return res.status(400).json({ error: 'اسم الجهة مطلوب' })
  const logo = req.file ? `/uploads/${req.file.filename}` : req.body.logo || ''
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM agencies').get().m
  const info = db
    .prepare('INSERT INTO agencies (name, short, logo, url, sort_order) VALUES (?, ?, ?, ?, ?)')
    .run(name.trim(), short, logo, url || '#', maxOrder + 1)
  res.status(201).json(db.prepare('SELECT * FROM agencies WHERE id = ?').get(info.lastInsertRowid))
})

app.put('/api/agencies/:id', auth, upload.single('logoFile'), (req, res) => {
  const existing = db.prepare('SELECT * FROM agencies WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'الجهة غير موجودة' })
  const name = (req.body.name ?? existing.name).trim()
  if (!name) return res.status(400).json({ error: 'اسم الجهة مطلوب' })
  const short = req.body.short ?? existing.short
  const url = req.body.url ?? existing.url
  const logo = req.file ? `/uploads/${req.file.filename}` : req.body.logo ?? existing.logo
  db.prepare('UPDATE agencies SET name = ?, short = ?, logo = ?, url = ? WHERE id = ?').run(
    name,
    short,
    logo,
    url || '#',
    req.params.id,
  )
  res.json(db.prepare('SELECT * FROM agencies WHERE id = ?').get(req.params.id))
})

app.delete('/api/agencies/:id', auth, (req, res) => {
  const info = db.prepare('DELETE FROM agencies WHERE id = ?').run(req.params.id)
  if (info.changes === 0) return res.status(404).json({ error: 'الجهة غير موجودة' })
  res.json({ ok: true })
})

// ---- static (uploads always; built frontend in production) ----
app.use('/uploads', express.static(UPLOAD_DIR))

if (process.env.NODE_ENV === 'production') {
  const dist = path.join(ROOT, 'dist')
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`))
