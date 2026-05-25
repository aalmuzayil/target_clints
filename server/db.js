import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'data.db')

import fs from 'node:fs'
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

export const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

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
`)

const SEED_AGENCIES = [
  { name: 'الهيئة السعودية للبيانات والذكاء الاصطناعي', short: 'سدايا', logo: '/logos/sdaia.jpg', url: 'https://sdaia.gov.sa' },
  { name: 'الهيئة السعودية للمدن الصناعية ومناطق التقنية', short: 'مدن', logo: '/logos/modon.png', url: 'https://modon.gov.sa' },
  { name: 'الهيئة السعودية للمراجعين الداخليين', short: 'هيئة المراجعين الداخليين', logo: '/logos/internal-auditors.png', url: '#' },
  { name: 'الهيئة السعودية للمراجعين والمحاسبين', short: 'سوكبا', logo: '/logos/socpa.jpg', url: 'https://socpa.org.sa' },
  { name: 'الهيئة السعودية للمياه', short: 'هيئة المياه', logo: '/logos/water.png', url: '#' },
  { name: 'الهيئة العامة للأمن الغذائي', short: 'الأمن الغذائي', logo: '/logos/food-security.png', url: 'https://gfsa.gov.sa' },
  { name: 'الهيئة العامة للعناية بشؤون المسجد الحرام والمسجد النبوي', short: 'العناية بالحرمين', logo: '/logos/two-holy-mosques.png', url: '#' },
  { name: 'الهيئة العامة للمساحة والمعلومات الجيومكانية', short: 'المساحة الجيومكانية', logo: '/logos/geospatial.jpg', url: 'https://gasgi.gov.sa' },
  { name: 'الهيئة العامة للولاية على أموال القاصرين ومن في حكمهم', short: 'أموال القاصرين', logo: '/logos/minors-funds.jpg', url: '#' },
]

export function seed() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase()
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin1234'

  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c
  if (userCount === 0) {
    const hash = bcrypt.hashSync(adminPassword, 10)
    db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(adminEmail, hash)
    console.log(`[seed] created admin user: ${adminEmail}`)
  }

  const agencyCount = db.prepare('SELECT COUNT(*) AS c FROM agencies').get().c
  if (agencyCount === 0) {
    const insert = db.prepare(
      'INSERT INTO agencies (name, short, logo, url, sort_order) VALUES (@name, @short, @logo, @url, @order)',
    )
    SEED_AGENCIES.forEach((a, i) => insert.run({ ...a, order: i }))
    console.log(`[seed] inserted ${SEED_AGENCIES.length} agencies`)
  }
}
