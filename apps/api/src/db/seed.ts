import { createHash, randomBytes } from 'node:crypto'
import { env } from '../env.js'
import { getDb, setSetting } from './index.js'

export function hashPin(pin: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${pin}`).digest('hex')
}

/** Cai dat mac dinh. Chi ghi khi key chua ton tai (khong ghi de lua chon cua bo me). */
const DEFAULT_SETTINGS: Record<string, string> = {
  // Phat video
  autoplay_default: '0', // nguyen tac: autoplay mac dinh TAT
  autoplay_max: '3',
  // Offline
  offline_enabled: '0', // mac dinh TAT (dieu khoan YouTube la vung xam)
  offline_max_gb: '20',
  offline_auto_favorites: '0', // tu tai video trong ke Yeu thich
  // Giao dien
  ui_mode_override: 'auto', // auto | touch | tv
  sfx_enabled: '1',
  warn_before_min: '5', // dem nguoc than thien truoc khi het gio
  // Nhap nguon
  pull_interval_hours: '6',
  // Hien thi
  show_duration: '1',
  show_download_badge: '1',
}

const DEFAULT_SHELVES: Array<{ title: string; emoji: string; color: string }> = [
  { title: 'HÔM NAY XEM GÌ', emoji: '🌟', color: '#ffd23f' },
  { title: 'BÀI HÁT', emoji: '🎤', color: '#ff6b8a' },
  { title: 'HỌC CHỮ & SỐ', emoji: '🔢', color: '#4ecdc4' },
  { title: 'KHÁM PHÁ', emoji: '🔭', color: '#a78bfa' },
]

/** Bo loc goi y san. Bo me co the xoa/sua tuy y. */
const DEFAULT_FILTERS: Array<{ type: string; value: string; note: string }> = [
  { type: 'block_live', value: '1', note: 'Chặn video đang phát trực tiếp' },
  { type: 'max_duration', value: '2400', note: 'Chặn video dài hơn 40 phút' },
  { type: 'min_duration', value: '45', note: 'Chặn video ngắn hơn 45 giây (thường là Shorts)' },
]

export function seedIfNeeded(): { seeded: boolean; pin?: string } {
  const db = getDb()

  const already = db
    .prepare<[string], { value: string }>('SELECT value FROM meta WHERE key = ?')
    .get('seeded')

  // Settings luon duoc bo sung — de phien ban moi them key moi ma khong mat
  // lua chon cu cua bo me.
  const insertSetting = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING',
  )
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(k, v)

  if (already) return { seeded: false }

  const tx = db.transaction(() => {
    // PIN: luu salt + hash, khong bao gio luu PIN tho
    const salt = randomBytes(16).toString('hex')
    setSetting('pin_salt', salt)
    setSetting('pin_hash', hashPin(env.defaultPin, salt))
    setSetting('pin_is_default', '1') // de admin UI nhac doi PIN

    db.prepare(
      `INSERT INTO profiles (name, avatar, color, daily_limit_min, session_limit_min, position)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('Bé', '🐻', '#ffd23f', 30, 15, 0)

    const insertShelf = db.prepare(
      'INSERT INTO shelves (title, emoji, color, position) VALUES (?, ?, ?, ?)',
    )
    DEFAULT_SHELVES.forEach((s, i) => insertShelf.run(s.title, s.emoji, s.color, i))

    const insertFilter = db.prepare(
      'INSERT INTO filter_rules (type, value, note) VALUES (?, ?, ?)',
    )
    for (const f of DEFAULT_FILTERS) insertFilter.run(f.type, f.value, f.note)

    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(
      'seeded',
      new Date().toISOString(),
    )
  })

  tx()
  return { seeded: true, pin: env.defaultPin }
}
