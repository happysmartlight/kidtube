import { getDb, getSettingInt } from '../db/index.js'
import type { KidSessionRow, ProfileRow } from '../db/types.js'
import { notFound } from '../lib/errors.js'
import { localDay, localHm, parseSqlDate, sqlNow, withinWindow } from '../lib/time.js'

/**
 * Quota duoc tinh HOAN TOAN o server (nguyen tac P5).
 * Client chi hien thi. Reload trang khong reset duoc gi vi phien duoc nhan dien
 * theo profile_id + cua so thoi gian, khong theo state cua trinh duyet.
 */

/**
 * Khong hoat dong qua lau thi coi nhu da ket thuc phien.
 * Y nghia: xem 15 phut -> nghi 10 phut -> duoc mot phien moi.
 * Gioi han theo NGAY moi la rao chan thuc su.
 */
const SESSION_GAP_SEC = 10 * 60

/** Heartbeat dai hon muc nay bi coi la client treo/ngu -> khong cong don. */
const MAX_HEARTBEAT_SEC = 90

export type BlockReason =
  | 'outside_window'
  | 'daily_limit'
  | 'session_limit'
  | 'video_limit'
  | 'profile_inactive'

export interface QuotaState {
  allowed: boolean
  reason: BlockReason | null
  /** Thong diep tieng Viet, hien thang cho tre. */
  message: string | null

  dailyLimitSec: number // 0 = khong gioi han
  dailyUsedSec: number
  /** Phut bo me cho them HOM NAY (giay) — da tinh vao dailyRemainingSec. */
  dailyBonusSec: number
  dailyRemainingSec: number | null // null = khong gioi han

  sessionLimitSec: number
  sessionUsedSec: number
  /** Phut cho them trong LUOT nay (giay) — da tinh vao sessionRemainingSec. */
  sessionBonusSec: number
  sessionRemainingSec: number | null

  videoLimit: number
  videosWatched: number
  videosRemaining: number | null

  allowedFrom: string
  allowedTo: string

  /** Con bao nhieu giay thi bat dau dem nguoc than thien. */
  warnAtSec: number
  /** Da den luc canh bao chua. */
  warning: boolean
}

export function getProfile(profileId: number): ProfileRow {
  const p = getDb()
    .prepare<[number], ProfileRow>('SELECT * FROM profiles WHERE id = ?')
    .get(profileId)
  if (!p) throw notFound(`Không có bé id=${profileId}`)
  return p
}

/**
 * Lay phien dang mo, hoac tao phien moi.
 * Phien cu bi dong lai neu da qua SESSION_GAP_SEC khong hoat dong,
 * hoac neu da sang ngay moi.
 */
export function getOrCreateSession(profileId: number): KidSessionRow {
  const db = getDb()
  const today = localDay()

  const open = db
    .prepare<[number], KidSessionRow>(
      'SELECT * FROM kid_sessions WHERE profile_id = ? AND closed = 0 ORDER BY last_seen_at DESC LIMIT 1',
    )
    .get(profileId)

  if (open) {
    const last = parseSqlDate(open.last_seen_at)
    const idleSec = last ? (Date.now() - last.getTime()) / 1000 : Number.POSITIVE_INFINITY
    const sameDay = open.day === today

    if (sameDay && idleSec < SESSION_GAP_SEC) return open

    db.prepare('UPDATE kid_sessions SET closed = 1 WHERE id = ?').run(open.id)
  }

  const info = db
    .prepare('INSERT INTO kid_sessions (profile_id, day, started_at, last_seen_at) VALUES (?, ?, ?, ?)')
    .run(profileId, today, sqlNow(), sqlNow())

  return db
    .prepare<[number], KidSessionRow>('SELECT * FROM kid_sessions WHERE id = ?')
    .get(Number(info.lastInsertRowid))!
}

function dailyUsedSec(profileId: number): number {
  const row = getDb()
    .prepare<[number, string], { total: number | null }>(
      'SELECT SUM(seconds_used) AS total FROM kid_sessions WHERE profile_id = ? AND day = ?',
    )
    .get(profileId, localDay())
  return row?.total ?? 0
}

/** Tong phut bo me cho them (giay): theo ngay, va rieng phien dang mo. */
function bonusSec(profileId: number, sessionId: number): { daily: number; session: number } {
  const row = getDb()
    .prepare<[number, number, string], { daily: number | null; session: number | null }>(
      `SELECT SUM(seconds) AS daily,
              SUM(CASE WHEN session_id = ? THEN seconds ELSE 0 END) AS session
         FROM time_grants
        WHERE profile_id = ? AND day = ?`,
    )
    .get(sessionId, profileId, localDay())
  return { daily: row?.daily ?? 0, session: row?.session ?? 0 }
}

export function computeQuota(profileId: number): QuotaState {
  const profile = getProfile(profileId)
  const session = getOrCreateSession(profileId)

  const dailyLimitSec = profile.daily_limit_min * 60
  const sessionLimitSec = profile.session_limit_min * 60
  const videoLimit = profile.video_limit_session

  const dailyUsed = dailyUsedSec(profileId)
  const sessionUsed = session.seconds_used
  const videosWatched = session.videos_watched
  const bonus = bonusSec(profileId, session.id)

  // Phut thuong CONG vao gioi han, khong tru vao thoi gian da xem: so "hom
  // nay da xem" luon dung that, va cho them luc phien vua mo (0 giay) van du.
  const dailyRemaining =
    dailyLimitSec > 0 ? Math.max(0, dailyLimitSec + bonus.daily - dailyUsed) : null
  const sessionRemaining =
    sessionLimitSec > 0 ? Math.max(0, sessionLimitSec + bonus.session - sessionUsed) : null
  const videosRemaining = videoLimit > 0 ? Math.max(0, videoLimit - videosWatched) : null

  const warnAtSec = getSettingInt('warn_before_min', 5) * 60

  let reason: BlockReason | null = null
  let message: string | null = null

  if (profile.is_active !== 1) {
    reason = 'profile_inactive'
    message = 'Hồ sơ này đang tắt. Nhờ bố mẹ bật lại nhé!'
  } else if (!withinWindow(localHm(), profile.allowed_from, profile.allowed_to)) {
    reason = 'outside_window'
    message = `Giờ xem là từ ${profile.allowed_from} đến ${profile.allowed_to}. Hẹn gặp lại nhé! 🌙`
  } else if (dailyRemaining !== null && dailyRemaining <= 0) {
    reason = 'daily_limit'
    message = 'Hôm nay xem đủ rồi. Mai mình xem tiếp nhé! 🌙'
  } else if (sessionRemaining !== null && sessionRemaining <= 0) {
    reason = 'session_limit'
    message = 'Nghỉ một chút nhé! Lát nữa quay lại xem tiếp. 🧸'
  } else if (videosRemaining !== null && videosRemaining <= 0) {
    reason = 'video_limit'
    message = `Xem đủ ${videoLimit} video rồi. Nghỉ một chút nhé! 🧸`
  }

  // Dem nguoc than thien tinh theo gioi han NAO SAP HET TRUOC.
  const effectiveRemaining = smallest(dailyRemaining, sessionRemaining)

  return {
    allowed: reason === null,
    reason,
    message,
    dailyLimitSec,
    dailyUsedSec: dailyUsed,
    dailyBonusSec: bonus.daily,
    dailyRemainingSec: dailyRemaining,
    sessionLimitSec,
    sessionUsedSec: sessionUsed,
    sessionBonusSec: bonus.session,
    sessionRemainingSec: sessionRemaining,
    videoLimit,
    videosWatched,
    videosRemaining,
    allowedFrom: profile.allowed_from,
    allowedTo: profile.allowed_to,
    warnAtSec,
    warning:
      reason === null && effectiveRemaining !== null && effectiveRemaining <= warnAtSec,
  }
}

function smallest(a: number | null, b: number | null): number | null {
  if (a === null) return b
  if (b === null) return a
  return Math.min(a, b)
}

/**
 * Cong thoi gian da xem. Goi tu heartbeat cua client moi ~15 giay.
 *
 * `seconds` bi kep tran o MAX_HEARTBEAT_SEC: neu tab bi ngu (laptop dong nap)
 * roi tinh lai, client co the gui mot con so khong lo. Chi cong phan hop ly.
 */
export function addWatchTime(profileId: number, seconds: number): QuotaState {
  const clamped = Math.max(0, Math.min(Math.round(seconds), MAX_HEARTBEAT_SEC))
  const session = getOrCreateSession(profileId)

  getDb()
    .prepare('UPDATE kid_sessions SET seconds_used = seconds_used + ?, last_seen_at = ? WHERE id = ?')
    .run(clamped, sqlNow(), session.id)

  return computeQuota(profileId)
}

/** Danh dau da xem xong mot video (dung cho gioi han so video/luot). */
export function countVideo(profileId: number): void {
  const session = getOrCreateSession(profileId)
  getDb()
    .prepare('UPDATE kid_sessions SET videos_watched = videos_watched + 1, last_seen_at = ? WHERE id = ?')
    .run(sqlNow(), session.id)
}

/** Giu phien song ma khong cong thoi gian (tre dang chon video, chua xem). */
export function touchSession(profileId: number): void {
  const session = getOrCreateSession(profileId)
  getDb()
    .prepare('UPDATE kid_sessions SET last_seen_at = ? WHERE id = ?')
    .run(sqlNow(), session.id)
}

/** Dong phien hien tai — dung khi tre thoat ra man hinh chon be. */
export function closeSession(profileId: number): void {
  getDb()
    .prepare('UPDATE kid_sessions SET closed = 1 WHERE profile_id = ? AND closed = 0')
    .run(profileId)
}

/**
 * Ly do chan ma "cho them gio" GO duoc. Ngoai khung gio thi khung gio duoc
 * kiem tra TRUOC moi gioi han khac — cong bao nhieu phut van bi chan; ho so
 * dang tat cung vay. Man "het gio" chi hien nut cho cac ly do nay.
 */
export const GRANTABLE_REASONS: readonly BlockReason[] = ['daily_limit', 'session_limit', 'video_limit']

/**
 * Bo me cho xem them `minutes` phut.
 *
 * Ghi MOT dong vao time_grants: phut thuong cong vao CA gioi han ngay (cua
 * hom nay) LAN gioi han luot (cua phien dang mo) — "cho them 15 phut" nghia
 * la be xem them duoc 15 phut, bat ke gioi han nao vua chan. Dong thoi dat
 * lai so video cua luot: cong phut ma van ket o gioi han so video thi nhu
 * chua cho gi. `minutes = 0` = chi "cho xem tiep" (dat lai so video).
 */
export function grantExtraMinutes(
  profileId: number,
  minutes: number,
  source: 'admin' | 'kid_screen',
): void {
  const reason = computeQuota(profileId).reason
  const session = getOrCreateSession(profileId)
  const db = getDb()
  db.transaction(() => {
    db.prepare(
      `INSERT INTO time_grants (profile_id, session_id, day, seconds, reason, source)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(profileId, session.id, localDay(), Math.round(minutes * 60), reason, source)
    // Cham phien: man het gio da dung yen mot luc thi phien sap qua moc 10
    // phut nghi — dong ngay sau khi cap la mat phut thuong theo luot.
    db.prepare('UPDATE kid_sessions SET videos_watched = 0, last_seen_at = ? WHERE id = ?').run(
      sqlNow(),
      session.id,
    )
  })()
}
