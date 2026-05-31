import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { MINISTRIES, AUTHORITIES, COMPANIES, COMPLETED, RECENT, TARGET_USERS, TARGET_ASSIGNMENTS } from './seed-data.js'
import { NAME_EN } from './names-en.js'
import { BRIEFS } from './briefs.js'
import { ATTRITION } from './attrition.js'
import { PROSPECTS } from './prospects.js'
import { TADAWUL } from './tadawul.js'
import { SEMIGOV } from './semigov.js'
import { PIF_ADDITIONS } from './pif-additions.js'
import { EMPLOYEES } from './employees.js'

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
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    company_id INTEGER,
    company_name TEXT NOT NULL DEFAULT '',
    actor TEXT NOT NULL DEFAULT '',
    from_status TEXT NOT NULL DEFAULT '',
    to_status TEXT NOT NULL DEFAULT '',
    meta TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_company ON events(company_id);
  CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
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
// admin-set "critical attrition rate" (percentage, 0-100; null = not set)
ensureColumn('agencies', 'attrition_rate', 'attrition_rate INTEGER')
// English display name (admin-editable); empty = fall back to Arabic name
ensureColumn('agencies', 'name_en', "name_en TEXT NOT NULL DEFAULT ''")
// approximate Saudi Arabia employee count (from LinkedIn data); null = unknown
ensureColumn('agencies', 'employees', 'employees INTEGER')
ensureColumn('reservations', 'comment', "comment TEXT NOT NULL DEFAULT ''")
ensureColumn('phone_users', 'nickname', "nickname TEXT NOT NULL DEFAULT ''")
// migrate legacy 'claimed' status to the 3-status model
db.exec("UPDATE agencies SET status = 'reserved' WHERE status = 'claimed'")

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
  setIfMissing('high_attrition_threshold', '20')

  // one-time English-name backfill: only fills empty name_en cells, so admin
  // edits are never overwritten. Bump the flag key to re-run after map changes.
  const nameEnDone = db.prepare("SELECT value FROM settings WHERE key = 'name_en_backfill_v1'").get()?.value
  if (nameEnDone !== '1') {
    const upd = db.prepare("UPDATE agencies SET name_en = ? WHERE name = ? AND COALESCE(name_en, '') = ''")
    let n = 0
    for (const [ar, en] of Object.entries(NAME_EN)) n += upd.run(en, ar).changes
    db.prepare("INSERT INTO settings (key, value) VALUES ('name_en_backfill_v1', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run()
    console.log(`[backfill] name_en set on ${n} entities`)
  }

  setIfMissing('approve_template', 'مرحباً {name}، تم قبول حجزك لجهة «{company}». سنتواصل معك لإتمام الإجراءات.')
  setIfMissing('activate_template', 'حياك الله {name}، تم تفعيل رقمك في منصة أكثم. يمكنك الآن تسجيل الدخول والاطلاع على قائمتك.')

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

  // additive: ensure the 'completed' companies exist (insert if missing by name).
  // Runs regardless of table emptiness so it works on the persistent DB.
  const exists = db.prepare('SELECT 1 FROM agencies WHERE name = ?')
  const insertCompleted = db.prepare(
    `INSERT INTO agencies (name, short, logo, url, sort_order, category, type, profile, status, approved)
     VALUES (?, '', ?, ?, ?, ?, 'company', ?, 'completed', 1)`,
  )
  const insertOpen = db.prepare(
    `INSERT INTO agencies (name, short, logo, url, sort_order, category, type, profile, status, approved)
     VALUES (?, '', ?, ?, ?, ?, 'company', ?, 'open', 1)`,
  )
  let maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM agencies').get().m
  let added = 0
  for (const c of COMPLETED) {
    if (!exists.get(c.name)) {
      insertCompleted.run(c.name, c.logo || '', c.url || '#', ++maxOrder, c.category || c.sector || '', c.desc || '')
      added++
    }
  }
  for (const c of RECENT) {
    if (!exists.get(c.name)) {
      insertOpen.run(c.name, c.logo || '', c.url || '#', ++maxOrder, c.sector || '', c.desc || '')
      added++
    }
  }
  if (added) console.log(`[seed] added ${added} companies (completed + recent)`)

  // one-time cleanup: remove logo-less COMPANIES (keep ministries/authorities).
  // Guarded by a flag so future admin-added companies are never auto-deleted.
  const cleaned = db.prepare("SELECT value FROM settings WHERE key = 'cleanup_nologo_companies'").get()?.value
  if (cleaned !== '1') {
    const r = db.prepare("DELETE FROM agencies WHERE type = 'company' AND COALESCE(logo, '') = ''").run()
    db.prepare("INSERT INTO settings (key, value) VALUES ('cleanup_nologo_companies', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run()
    if (r.changes) console.log(`[cleanup] removed ${r.changes} logo-less companies`)
  }

  // one-time targeted-clients import: create accounts, reserve their companies for
  // 2 weeks, and clear reservations on all other (non-completed) companies.
  const imported = db.prepare("SELECT value FROM settings WHERE key = 'targeted_clients_v1'").get()?.value
  if (imported !== '1') {
    const HOLD_2W = 14 * 24 * 60 * 60 * 1000
    const deadline = Date.now() + HOLD_2W
    const upUser = (phone, name, nick) => {
      const u = db.prepare('SELECT 1 FROM phone_users WHERE phone = ?').get(phone)
      if (u) db.prepare('UPDATE phone_users SET name=?, nickname=?, status=? WHERE phone=?').run(name, nick, 'approved', phone)
      else db.prepare("INSERT INTO phone_users (phone, name, nickname, created_at, status) VALUES (?,?,?,?, 'approved')").run(phone, name, nick, Date.now())
    }
    TARGET_USERS.forEach((u) => upUser(u.phone, u.name, u.nickname))

    const findByName = db.prepare('SELECT id FROM agencies WHERE name = ?')
    const insertCo = db.prepare(
      `INSERT INTO agencies (name, short, logo, url, sort_order, category, type, profile, status, approved)
       VALUES (?, '', '', '#', ?, '', 'company', '', 'reserved', 1)`,
    )
    let ord = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM agencies').get().m
    const targetIds = []
    for (const t of TARGET_ASSIGNMENTS) {
      let row = findByName.get(t.name)
      let id = row ? row.id : insertCo.run(t.name, ++ord).lastInsertRowid
      if (targetIds.includes(id)) continue // company already assigned to first owner
      db.prepare("UPDATE agencies SET status='reserved', reserved_by=?, reserve_deadline=? WHERE id=?").run(t.phone, deadline, id)
      db.prepare('INSERT OR IGNORE INTO phone_company_links (phone, company_id) VALUES (?, ?)').run(t.phone, id)
      targetIds.push(id)
    }
    // clear reservations on everything else (keep completed as-is)
    if (targetIds.length) {
      const ph = targetIds.map(() => '?').join(',')
      db.prepare(`UPDATE agencies SET status='open', reserved_by='', reserve_deadline=NULL WHERE status='reserved' AND id NOT IN (${ph})`).run(...targetIds)
    }
    db.prepare("INSERT INTO settings (key, value) VALUES ('targeted_clients_v1', '1') ON CONFLICT(key) DO UPDATE SET value='1'").run()
    console.log(`[import] targeted clients: ${TARGET_USERS.length} users, ${targetIds.length} reserved`)
  }

  // one-time briefs backfill (runs AFTER agencies exist): append the 3
  // LinkedIn-derived pain points to the existing profile, keeping the intro.
  const briefsDone = db.prepare("SELECT value FROM settings WHERE key = 'briefs_backfill_v1'").get()?.value
  if (briefsDone !== '1') {
    const upd = db.prepare(
      "UPDATE agencies SET profile = CASE WHEN TRIM(COALESCE(profile, '')) = '' THEN ? ELSE TRIM(profile) || char(10) || char(10) || ? END WHERE name = ?",
    )
    let n = 0
    for (const [name, pts] of Object.entries(BRIEFS)) {
      const block = 'أبرز التحديات:\n• ' + pts.join('\n• ')
      n += upd.run(block, block, name).changes
    }
    db.prepare("INSERT INTO settings (key, value) VALUES ('briefs_backfill_v1', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run()
    console.log(`[backfill] briefs appended to ${n} entities`)
  }

  // one-time attrition backfill from LinkedIn industry data: set the critical
  // attrition rate only where unset, so admin edits are preserved.
  const attrDone = db.prepare("SELECT value FROM settings WHERE key = 'attrition_backfill_v1'").get()?.value
  if (attrDone !== '1') {
    const upd = db.prepare('UPDATE agencies SET attrition_rate = ? WHERE name = ? AND attrition_rate IS NULL')
    let n = 0
    for (const [name, rate] of Object.entries(ATTRITION)) n += upd.run(rate, name).changes
    db.prepare("INSERT INTO settings (key, value) VALUES ('attrition_backfill_v1', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run()
    console.log(`[backfill] attrition_rate set on ${n} entities`)
  }

  // one-time prospects import: add high-attrition Saudi entities (from LinkedIn
  // data) as open targets if they don't already exist.
  const prosDone = db.prepare("SELECT value FROM settings WHERE key = 'prospects_import_v1'").get()?.value
  if (prosDone !== '1') {
    const exists = db.prepare('SELECT 1 FROM agencies WHERE name = ?')
    const ins = db.prepare(
      `INSERT INTO agencies (name, name_en, short, logo, url, sort_order, category, type, profile, status, approved, attrition_rate)
       VALUES (?, ?, '', '', '#', ?, ?, 'company', ?, 'open', 1, ?)`,
    )
    let ord = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM agencies').get().m
    let n = 0
    for (const p of PROSPECTS) {
      if (exists.get(p.name)) continue
      ins.run(p.name, p.name, ++ord, p.category || '', p.brief || '', p.attrition ?? null)
      n++
    }
    db.prepare("INSERT INTO settings (key, value) VALUES ('prospects_import_v1', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run()
    console.log(`[import] prospects added: ${n}`)
  }

  // one-time import: add all Tadawul-listed entities (logo + brief + link).
  const tadDone = db.prepare("SELECT value FROM settings WHERE key = 'tadawul_import_v1'").get()?.value
  if (tadDone !== '1') {
    const exists = db.prepare('SELECT 1 FROM agencies WHERE name = ?')
    const ins = db.prepare(
      `INSERT INTO agencies (name, name_en, short, logo, url, sort_order, category, type, profile, status, approved)
       VALUES (?, '', '', ?, ?, ?, '', 'company', ?, 'open', 1)`,
    )
    let ord = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM agencies').get().m
    let n = 0
    for (const e of TADAWUL) {
      if (exists.get(e.name)) continue
      ins.run(e.name, e.logo || '', e.url || '#', ++ord, e.brief || '')
      n++
    }
    db.prepare("INSERT INTO settings (key, value) VALUES ('tadawul_import_v1', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run()
    console.log(`[import] tadawul entities added: ${n}`)
  }

  // one-time label fix: drop the "(وفق بيانات LinkedIn)" note from existing briefs.
  const labelFix = db.prepare("SELECT value FROM settings WHERE key = 'briefs_label_fix_v1'").get()?.value
  if (labelFix !== '1') {
    const r = db
      .prepare("UPDATE agencies SET profile = REPLACE(profile, 'أبرز التحديات (وفق بيانات LinkedIn):', 'أبرز التحديات:') WHERE profile LIKE '%وفق بيانات LinkedIn%'")
      .run()
    db.prepare("INSERT INTO settings (key, value) VALUES ('briefs_label_fix_v1', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run()
    console.log(`[fix] brief label cleaned on ${r.changes} entities`)
  }

  // one-time semi-government classification: reclassify the mapped entities from
  // 'company' to 'semi' and store their affiliation in `category` (used as the
  // sub-filter for the شبه حكومي tier). Runs after all imports so every entity exists.
  const semiDone = db.prepare("SELECT value FROM settings WHERE key = 'semigov_backfill_v3'").get()?.value
  if (semiDone !== '1') {
    const upd = db.prepare("UPDATE agencies SET type = 'semi', category = ? WHERE name = ?")
    let n = 0
    for (const [name, affiliation] of Object.entries(SEMIGOV)) n += upd.run(affiliation, name).changes
    db.prepare("INSERT INTO settings (key, value) VALUES ('semigov_backfill_v3', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run()
    console.log(`[backfill] semi-government classification set on ${n} entities`)
  }

  // one-time deadline reset: extend every currently-reserved entity's hold to
  // 14 days from now, so existing reservations (created under the old 48h
  // default) don't appear expired.
  const dlDone = db.prepare("SELECT value FROM settings WHERE key = 'reset_deadlines_14d_v1'").get()?.value
  if (dlDone !== '1') {
    const newDeadline = Date.now() + 14 * 24 * 60 * 60 * 1000
    const r = db.prepare("UPDATE agencies SET reserve_deadline = ? WHERE status = 'reserved'").run(newDeadline)
    db.prepare("INSERT INTO settings (key, value) VALUES ('reset_deadlines_14d_v1', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run()
    console.log(`[backfill] extended ${r.changes} reservation deadlines to 14 days`)
  }

  // one-time PIF additions: insert the curated PIF subsidiaries that aren't
  // in the directory yet. Skips any name that already exists.
  const pifAddDone = db.prepare("SELECT value FROM settings WHERE key = 'pif_additions_v2'").get()?.value
  if (pifAddDone !== '1') {
    const exists = db.prepare('SELECT 1 FROM agencies WHERE name = ?')
    const ins = db.prepare(
      `INSERT INTO agencies (name, name_en, short, logo, url, sort_order, category, type, profile, status, approved)
       VALUES (?, ?, '', '', '#', ?, 'صندوق الاستثمارات العامة', 'semi', ?, 'open', 1)`,
    )
    let ord = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM agencies').get().m
    let n = 0
    for (const p of PIF_ADDITIONS) {
      if (exists.get(p.name)) continue
      ins.run(p.name, p.name_en || '', ++ord, p.brief || '')
      n++
    }
    db.prepare("INSERT INTO settings (key, value) VALUES ('pif_additions_v2', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run()
    console.log(`[seed] PIF additions inserted: ${n}`)
  }

  // one-time employee-count backfill from LinkedIn data: only sets it where
  // unset, so admin edits are preserved.
  const empDone = db.prepare("SELECT value FROM settings WHERE key = 'employees_backfill_v2'").get()?.value
  if (empDone !== '1') {
    // overwrite mapped entries so previously-capped values get the real count
    const upd = db.prepare('UPDATE agencies SET employees = ? WHERE name = ?')
    let n = 0
    for (const [name, count] of Object.entries(EMPLOYEES)) n += upd.run(count, name).changes
    db.prepare("INSERT INTO settings (key, value) VALUES ('employees_backfill_v2', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run()
    console.log(`[backfill] employee counts set on ${n} entities`)
  }

  // one-time wipe for a specific phone (admin-requested cleanup): release any
  // entities they hold, drop their assignments, history, user record, and
  // any events that reference them.
  const wipeDone = db.prepare("SELECT value FROM settings WHERE key = 'wipe_phone_0538006992_v1'").get()?.value
  if (wipeDone !== '1') {
    const variants = ['0538006992', '538006992', '966538006992', '+966538006992']
    const phs = variants.map(() => '?').join(',')
    const released = db.prepare(`UPDATE agencies SET status='open', reserved_by='', reserve_deadline=NULL WHERE reserved_by IN (${phs})`).run(...variants).changes
    const resDel = db.prepare(`DELETE FROM reservations WHERE phone IN (${phs}) OR lead_phone IN (${phs})`).run(...variants, ...variants).changes
    const linksDel = db.prepare(`DELETE FROM phone_company_links WHERE phone IN (${phs})`).run(...variants).changes
    const userDel = db.prepare(`DELETE FROM phone_users WHERE phone IN (${phs})`).run(...variants).changes
    const otpDel = db.prepare(`DELETE FROM otps WHERE phone IN (${phs})`).run(...variants).changes
    let evtDel = db.prepare(`DELETE FROM events WHERE actor IN (${phs})`).run(...variants).changes
    for (const v of variants) {
      evtDel += db.prepare("DELETE FROM events WHERE meta LIKE ?").run(`%${v}%`).changes
    }
    db.prepare("INSERT INTO settings (key, value) VALUES ('wipe_phone_0538006992_v1', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run()
    console.log(`[wipe] phone cleanup: released=${released} reservations=${resDel} links=${linksDel} users=${userDel} otps=${otpDel} events=${evtDel}`)
  }
}
