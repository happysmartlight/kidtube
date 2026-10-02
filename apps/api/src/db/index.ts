import Database from 'better-sqlite3'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from '../env.js'
import { buildSearchText } from '../lib/search.js'

const here = dirname(fileURLToPath(import.meta.url))

export type DB = Database.Database

let _db: DB | null = null

/**
 * schema.sql nam canh file nguon. Khi build bang tsc, file .sql KHONG duoc
 * copy sang dist/, nen thu ca hai vi tri: canh file da build va trong src/.
 */
function schemaPath(): string {
  const candidates = [
    join(here, 'schema.sql'),
    resolve(here, '../../src/db/schema.sql'),
    resolve(process.cwd(), 'apps/api/src/db/schema.sql'),
  ]
  for (const p of candidates) {
    try {
      readFileSync(p)
      return p
    } catch {
      /* thu tiep */
    }
  }
  throw new Error(`Khong tim thay schema.sql. Da thu:\n  ${candidates.join('\n  ')}`)
}

export function openDb(): DB {
  if (_db) return _db

  mkdirSync(env.dataDir, { recursive: true })
  mkdirSync(env.mediaDir, { recursive: true })

  const file = join(env.dataDir, 'kid.db')
  const db = new Database(file)

  // WAL cho phep doc song song trong khi ghi — quan trong vi downloader
  // ghi tien do lien tuc trong khi tre dang doc trang chu.
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.pragma('synchronous = NORMAL')

  db.exec(readFileSync(schemaPath(), 'utf8'))
  migrate(db)
  registerFunctions(db)

  _db = db
  return db
}

/**
 * Migration cho DB da ton tai.
 *
 * `schema.sql` dung CREATE TABLE IF NOT EXISTS, nen cot MOI them vao schema
 * se KHONG xuat hien trong DB da tao truoc do. Ham nay bu phan do:
 * kiem tra cot co ton tai chua, thieu thi ALTER TABLE.
 *
 * Them cot moi thi them mot dong vao COLUMN_MIGRATIONS — khong can viet
 * file migration co so thu tu.
 */
const COLUMN_MIGRATIONS: Array<{ table: string; column: string; ddl: string }> = [
  // NULL = chua biet, 1 = nhung duoc, 0 = chu kenh chan nhung ra ngoai YouTube.
  // Nhieu kenh tre em lon (Cocomelon...) chan nhung -> phai biet de khong
  // de tre bam vao roi gap man hinh loi.
  { table: 'videos', column: 'embeddable', ddl: 'INTEGER' },
  // title + channel_title da bo dau, viet thuong — dung cho o tim kiem.
  { table: 'videos', column: 'search_text', ddl: 'TEXT' },
]

function migrate(db: DB): void {
  for (const m of COLUMN_MIGRATIONS) {
    const cols = db
      .prepare<[], { name: string }>(`PRAGMA table_info(${m.table})`)
      .all()
      .map((c) => c.name)
    if (!cols.includes(m.column)) {
      db.exec(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.ddl}`)
    }
  }

  backfillSearchText(db)
}

/**
 * Tinh `search_text` cho cac video chua co.
 *
 * Chay moi lan mo DB nhung chi cham vao dong NULL, nen sau lan dau la
 * mot cau COUNT rong. Khong the lam bang SQL thuan: SQLite khong co ham
 * bo dau tieng Viet — phai tinh trong JS.
 */
function backfillSearchText(db: DB): void {
  const rows = db
    .prepare<[], { id: number; title: string; channel_title: string | null }>(
      'SELECT id, title, channel_title FROM videos WHERE search_text IS NULL',
    )
    .all()
  if (rows.length === 0) return

  const stmt = db.prepare('UPDATE videos SET search_text = ? WHERE id = ?')
  const tx = db.transaction(() => {
    for (const r of rows) stmt.run(buildSearchText(r.title, r.channel_title), r.id)
  })
  tx()
}

/**
 * Ham SQL tu dinh nghia.
 *
 * `seeded_rand(id, seed)` — xao tron co the LAP LAI DUOC.
 *
 * Vi sao khong dung `ORDER BY random()` cua SQLite: no doi ket qua moi lan
 * chay, nen trang 2 cua cung mot danh sach se lap lai video cua trang 1 va
 * bo sot nhung cai khac. Tre bam "Xem them" se thay video trung — hong.
 *
 * Voi ham nay, cung mot `seed` cho ra cung mot thu tu, nen phan trang chinh
 * xac. Bam "Lam moi" = doi seed = mot thu tu hoan toan khac.
 *
 * Bam ham la bien the cua MurmurHash3 finalizer: tron deu, re, va khong phu
 * thuoc thu tu id (id lien tiep van cho ket qua rai rac).
 */
function registerFunctions(db: DB): void {
  db.function('seeded_rand', { deterministic: true, varargs: false }, (id, seed) => {
    let x = (Math.imul(Number(id) | 0, 2654435761) + (Number(seed) | 0)) >>> 0
    x ^= x >>> 16
    x = Math.imul(x, 2246822519) >>> 0
    x ^= x >>> 13
    x = Math.imul(x, 3266489917) >>> 0
    x ^= x >>> 16
    return x
  })
}

export function getDb(): DB {
  if (!_db) return openDb()
  return _db
}

export function closeDb(): void {
  _db?.close()
  _db = null
}

// ─── Helper settings ──────────────────────────────────────────────────

export function getSetting(key: string): string | null {
  const row = getDb().prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?').get(key)
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}

export function getSettingBool(key: string, fallback = false): boolean {
  const v = getSetting(key)
  if (v === null) return fallback
  return v === '1' || v === 'true'
}

export function getSettingInt(key: string, fallback: number): number {
  const v = getSetting(key)
  if (v === null) return fallback
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : fallback
}

export function getAllSettings(): Record<string, string> {
  const rows = getDb().prepare<[], { key: string; value: string }>('SELECT key, value FROM settings').all()
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}
