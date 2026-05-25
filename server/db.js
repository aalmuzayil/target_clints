import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

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
`)

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

const SEED_AGENCIES = [
  { name: 'الهيئة السعودية للبيانات والذكاء الاصطناعي', short: 'سدايا', logo: '/logos/sdaia.jpg', url: 'https://sdaia.gov.sa', category: 'تقنية', status: 'open' },
  { name: 'الهيئة السعودية للمدن الصناعية ومناطق التقنية', short: 'مدن', logo: '/logos/modon.png', url: 'https://modon.gov.sa', category: 'صناعة', status: 'open' },
  { name: 'الهيئة السعودية للمراجعين الداخليين', short: 'هيئة المراجعين الداخليين', logo: '/logos/internal-auditors.png', url: '#', category: 'مالية', status: 'claimed' },
  { name: 'الهيئة السعودية للمراجعين والمحاسبين', short: 'سوكبا', logo: '/logos/socpa.jpg', url: 'https://socpa.org.sa', category: 'مالية', status: 'open' },
  { name: 'الهيئة السعودية للمياه', short: 'هيئة المياه', logo: '/logos/water.png', url: '#', category: 'بنية تحتية', status: 'completed' },
  { name: 'الهيئة العامة للأمن الغذائي', short: 'الأمن الغذائي', logo: '/logos/food-security.png', url: 'https://gfsa.gov.sa', category: 'غذاء', status: 'open' },
  { name: 'الهيئة العامة للعناية بشؤون المسجد الحرام والمسجد النبوي', short: 'العناية بالحرمين', logo: '/logos/two-holy-mosques.png', url: '#', category: 'خدمات', status: 'open' },
  { name: 'الهيئة العامة للمساحة والمعلومات الجيومكانية', short: 'المساحة الجيومكانية', logo: '/logos/geospatial.jpg', url: 'https://gasgi.gov.sa', category: 'تقنية', status: 'reserved' },
  { name: 'الهيئة العامة للولاية على أموال القاصرين ومن في حكمهم', short: 'أموال القاصرين', logo: '/logos/minors-funds.jpg', url: '#', category: 'مالية', status: 'open' },
]

export function seed() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase()
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin1234'

  if (db.prepare('SELECT COUNT(*) AS c FROM users').get().c === 0) {
    const hash = bcrypt.hashSync(adminPassword, 10)
    db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(adminEmail, hash)
    console.log(`[seed] created admin user: ${adminEmail}`)
  }

  if (db.prepare('SELECT COUNT(*) AS c FROM agencies').get().c === 0) {
    const insert = db.prepare(
      `INSERT INTO agencies (name, short, logo, url, sort_order, category, status, approved)
       VALUES (@name, @short, @logo, @url, @order, @category, @status, 1)`,
    )
    SEED_AGENCIES.forEach((a, i) => insert.run({ ...a, order: i }))
    console.log(`[seed] inserted ${SEED_AGENCIES.length} companies`)
  }
}
