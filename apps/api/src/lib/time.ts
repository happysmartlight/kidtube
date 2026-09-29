/**
 * Tien ich thoi gian.
 *
 * Quan trong: quota tinh theo NGAY DIA PHUONG cua may chay server (Pi),
 * khong phai UTC. Neu dung UTC thi o Viet Nam quota se reset luc 7h sang,
 * dung giua luc tre dang xem.
 */

/** YYYY-MM-DD theo gio dia phuong. */
export function localDay(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** HH:MM theo gio dia phuong. */
export function localHm(d: Date = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** So phut tu nua dem, dung de so sanh khung gio cho phep. */
export function minutesOfDay(hm: string): number {
  const parts = hm.split(':')
  const h = Number.parseInt(parts[0] ?? '0', 10)
  const m = Number.parseInt(parts[1] ?? '0', 10)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return h * 60 + m
}

/**
 * Kiem tra `now` co nam trong khung [from, to] khong.
 * Ho tro khung vat qua nua dem (vi du 20:00 -> 07:00), du truong hop nay
 * hiem dung cho tre con.
 */
export function withinWindow(now: string, from: string, to: string): boolean {
  const n = minutesOfDay(now)
  const f = minutesOfDay(from)
  const t = minutesOfDay(to)
  if (f === t) return true // khung rong = khong gioi han
  if (f < t) return n >= f && n <= t
  return n >= f || n <= t // vat qua nua dem
}

/** Chuoi datetime kieu SQLite theo UTC, khop voi datetime('now'). */
export function sqlNow(d: Date = new Date()): string {
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

/** Parse chuoi datetime cua SQLite (UTC, khong co hau to Z) ve Date. */
export function parseSqlDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const iso = s.includes('T') ? s : s.replace(' ', 'T')
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Parse ISO 8601 duration cua YouTube Data API (PT4M13S) ra giay. */
export function parseIsoDuration(iso: string): number | null {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso)
  if (!m) return null
  const [, d, h, min, s] = m
  const total =
    Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0)
  return total > 0 ? total : null
}
