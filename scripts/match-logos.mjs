// Matches each seeded entity to a logo file in ~/Downloads and copies it into
// public/logos/auto, writing server/logos-map.json (entity name -> logo path).
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { MINISTRIES, AUTHORITIES, COMPANIES } from '../server/seed-data.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DOWNLOADS = path.join(os.homedir(), 'Downloads')
const OUT_DIR = path.join(ROOT, 'public', 'logos', 'auto')
fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(OUT_DIR, { recursive: true })

const IMG = /\.(png|jpe?g|svg|webp)$/i

function norm(s) {
  return s
    .replace(IMG, '')
    .replace(/\s*\(\d+\)\s*/g, '')
    .replace(/^gov2_|^mygov_|^gov_/i, '')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ؤئ]/g, 'و')
    .replace(/[^ء-ي]/g, '')
    .replace(/^شعار/, '')
    .replace(/^وهويه/, '')
}

function listFiles(dir, recurse = false) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory() && recurse) out.push(...listFiles(p, false))
    else if (e.isFile() && IMG.test(e.name)) out.push(p)
  }
  return out
}

// candidate pools
const ministryFiles = [
  ...listFiles(path.join(DOWNLOADS, 'gov_ministries_17489')),
  ...listFiles(DOWNLOADS).filter((f) => /gov2_/i.test(path.basename(f))),
]
const authorityFiles = [
  ...listFiles(path.join(DOWNLOADS, 'mygov_agency_logos')),
  ...listFiles(DOWNLOADS).filter((f) => /^mygov_/i.test(path.basename(f)) && !/icon|cookies/i.test(path.basename(f))),
]
const allFiles = listFiles(DOWNLOADS)

function bestArabicMatch(name, files) {
  const a = norm(name)
  let best = null
  let bestLen = 0
  for (const f of files) {
    const b = norm(path.basename(f))
    if (b.length < 8) continue
    const matchLen = a.startsWith(b) ? b.length : b.startsWith(a) ? a.length : 0
    if (matchLen >= 9 && matchLen > bestLen) {
      bestLen = matchLen
      best = f
    }
  }
  return best
}

// company brand keyword -> filename regex
const COMPANY_KEYS = {
  روشن: /roshn/i,
  الدرعية: /diriyah/i,
  'البحر الأحمر العالمية': /red.?sea/i,
  القدية: /qiddiya|القدية/i,
  لوسيد: /lucid/i,
  'أكوا باور': /acwa/i,
  معادن: /maaden|معادن/i,
  stc: /\bstc\b|اس_?تي_?سي/i,
  'شركة علم': /elm|علم/i,
  نيوم: /neom|نيوم/i,
  'الشركة الوطنية للتنمية الزراعية (نادك)': /nadec|نادك/i,
}

let idx = 0
const map = {}
function take(name, file) {
  if (!file) return false
  const ext = path.extname(file).toLowerCase()
  const out = `e${idx++}${ext}`
  fs.copyFileSync(file, path.join(OUT_DIR, out))
  map[name] = `/logos/auto/${out}`
  return true
}

let hits = 0
for (const m of MINISTRIES)
  if (take(m.name, bestArabicMatch(m.name, ministryFiles) || bestArabicMatch(m.name, allFiles))) hits++
for (const a of AUTHORITIES)
  if (take(a.name, bestArabicMatch(a.name, authorityFiles) || bestArabicMatch(a.name, allFiles))) hits++
for (const c of COMPANIES) {
  const re = COMPANY_KEYS[c.name]
  let file = null
  if (re) file = allFiles.find((f) => re.test(path.basename(f)))
  if (!file) file = bestArabicMatch(c.name, allFiles)
  if (take(c.name, file)) hits++
}

fs.writeFileSync(path.join(ROOT, 'server', 'logos-map.json'), JSON.stringify(map, null, 2))
const total = MINISTRIES.length + AUTHORITIES.length + COMPANIES.length
console.log(`matched ${hits}/${total} logos -> server/logos-map.json`)
for (const [k, v] of Object.entries(map)) console.log(`  ${k}  ->  ${v}`)
