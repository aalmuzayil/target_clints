import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { MINISTRIES, AUTHORITIES, COMPANIES } from './seed-data.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'data.db')

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

export const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

// ---- base tables ----
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS agencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    short TEXT NOT NULL DEFAULT '',
    logo TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '#',
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS phone_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS otps (
    phone TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    phone TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    decided_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS phone_company_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    company_id INTEGER NOT NULL,
    UNIQUE(phone, company_id)
  );
  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS category_profiles (
    category TEXT PRIMARY KEY,
    profile_file TEXT NOT NULL DEFAULT ''
  );
`)

export const DEFAULT_INTRO =
  'مرحباً، أتواصل معكم عبر منصة أكثم — منصة تحليلات القوى العاملة ودعم القرار بالذكاء الاصطناعي. يسعدني مشاركتكم الملف التعريفي للاطلاع.'
export const DEFAULT_PROFILE = '/aktham-profile.pdf'

// ---- idempotent column migrations on agencies (existing prod data is preserved) ----
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
    console.log(`[migrate] added ${table}.${column}`)
  }
}
ensureColumn('agencies', 'status', "status TEXT NOT NULL DEFAULT 'open'")
ensureColumn('agencies', 'category', "category TEXT NOT NULL DEFAULT ''")
ensureColumn('agencies', 'profile', "profile TEXT NOT NULL DEFAULT ''")
ensureColumn('agencies', 'contact_phone', "contact_phone TEXT NOT NULL DEFAULT ''")
ensureColumn('agencies', 'reserve_deadline', 'reserve_deadline INTEGER')
ensureColumn('agencies', 'reserved_by', "reserved_by TEXT NOT NULL DEFAULT ''")
ensureColumn('agencies', 'approved', 'approved INTEGER NOT NULL DEFAULT 1')
ensureColumn('agencies', 'submitted_by', "submitted_by TEXT NOT NULL DEFAULT ''")
ensureColumn('agencies', 'profile_file', "profile_file TEXT NOT NULL DEFAULT ''")
ensureColumn('reservations', 'lead_phone', "lead_phone TEXT NOT NULL DEFAULT ''")
// access control: 'approved' can sign in; 'pending' is an awaiting-approval request
ensureColumn('phone_users', 'status', "status TEXT NOT NULL DEFAULT 'approved'")
// type: 'ministry' | 'authority' | 'company'
ensureColumn('agencies', 'type', "type TEXT NOT NULL DEFAULT 'company'")

// bump this when the seed dataset changes to force a one-time reload
const DATA_VERSION = '2025-05-25-real-data-3'

// logo map produced by scripts/match-logos.mjs (entity name -> /logos/auto/x)
let LOGO_MAP = {}
try {
  LOGO_MAP = JSON.parse(fs.readFileSync(path.join(__dirname, 'logos-map.json'), 'utf8'))
} catch {
  LOGO_MAP = {}
}

function buildSeedRows() {
  const rows = []
  let order = 0
  const push = (name, type, category, url, desc) =>
    rows.push({ name, type, category: category || '', url: url || '#', profile: desc || '', logo: LOGO_MAP[name] || '', order: order++ })
  MINISTRIES.forEach((m) => push(m.name, 'ministry', '', m.url, m.desc))
  AUTHORITIES.forEach((a) => push(a.name, 'authority', '', a.url, a.desc))
  COMPANIES.forEach((c) => push(c.name, 'company', c.sector, c.url, c.desc))
  return rows
}

export function seed() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase()
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin1234'

  if (db.prepare('SELECT COUNT(*) AS c FROM users').get().c === 0) {
    const hash = bcrypt.hashSync(adminPassword, 10)
    db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(adminEmail, hash)
    console.log(`[seed] created admin user: ${adminEmail}`)
  }

  const setIfMissing = (k, v) => {
    if (!db.prepare('SELECT 1 FROM settings WHERE key = ?').get(k)) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(k, v)
    }
  }
  setIfMissing('intro_message', DEFAULT_INTRO)
  setIfMissing('default_profile_file', DEFAULT_PROFILE)

  // Seed the catalog ONLY when empty, so admin edits/reservations are never wiped
  // on redeploys (data now persists on the /data volume).
  const count = db.prepare('SELECT COUNT(*) AS c FROM agencies').get().c
  if (count === 0) {
    const rows = buildSeedRows()
    const tx = db.transaction(() => {
      const insert = db.prepare(
        `INSERT INTO agencies (name, short, logo, url, sort_order, category, type, profile, status, approved)
         VALUES (@name, '', @logo, @url, @order, @category, @type, @profile, 'open', 1)`,
      )
      rows.forEach((r) => insert.run(r))
      db.prepare(
        "INSERT INTO settings (key, value) VALUES ('data_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).run(DATA_VERSION)
    })
    tx()
    console.log(`[seed] loaded ${rows.length} entries (version ${DATA_VERSION})`)
  }
}
