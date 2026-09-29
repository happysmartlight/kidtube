import { getDb } from '../db/index.js'
import { localDay } from '../lib/time.js'

export interface DaySummary {
  day: string
  profileId: number
  profileName: string
  avatar: string
  seconds: number
  videos: number
}

export interface TopVideo {
  videoId: number
  title: string
  thumbnail: string | null
  plays: number
  seconds: number
}

export interface DashboardStats {
  pendingCount: number
  approvedCount: number
  rejectedCount: number
  sourceCount: number
  shelfCount: number
  todayByProfile: DaySummary[]
  storageUsedBytes: number
  storageFileCount: number
  downloadQueued: number
  downloadErrors: number
}

export function dashboard(): DashboardStats {
  const db = getDb()
  const count = (sql: string, ...params: unknown[]): number =>
    (db.prepare<unknown[], { n: number }>(sql).get(...params)?.n ?? 0)

  const storage = db
    .prepare<[], { total: number | null; n: number }>(
      "SELECT SUM(file_size) AS total, COUNT(*) AS n FROM videos WHERE download_status = 'done'",
    )
    .get()

  return {
    pendingCount: count("SELECT COUNT(*) AS n FROM videos WHERE status = 'pending'"),
    approvedCount: count("SELECT COUNT(*) AS n FROM videos WHERE status = 'approved'"),
    rejectedCount: count("SELECT COUNT(*) AS n FROM videos WHERE status = 'rejected'"),
    sourceCount: count('SELECT COUNT(*) AS n FROM sources WHERE is_active = 1'),
    shelfCount: count('SELECT COUNT(*) AS n FROM shelves WHERE is_active = 1'),
    todayByProfile: summaryForDay(localDay()),
    storageUsedBytes: storage?.total ?? 0,
    storageFileCount: storage?.n ?? 0,
    downloadQueued: count("SELECT COUNT(*) AS n FROM download_queue WHERE status = 'queued'"),
    downloadErrors: count("SELECT COUNT(*) AS n FROM download_queue WHERE status = 'error'"),
  }
}

export function summaryForDay(day: string): DaySummary[] {
  return getDb()
    .prepare<[string], DaySummary>(
      `SELECT s.day            AS day,
              p.id             AS profileId,
              p.name           AS profileName,
              p.avatar         AS avatar,
              SUM(s.seconds_used)   AS seconds,
              SUM(s.videos_watched) AS videos
         FROM kid_sessions s
         JOIN profiles p ON p.id = s.profile_id
        WHERE s.day = ?
        GROUP BY p.id
        ORDER BY seconds DESC`,
    )
    .all(day)
}

/** Tong thoi gian xem theo ngay, `days` ngay gan nhat. Dung ve bieu do cot. */
export function recentDays(days = 14): Array<{ day: string; seconds: number; videos: number }> {
  return getDb()
    .prepare<[number], { day: string; seconds: number; videos: number }>(
      `SELECT day,
              SUM(seconds_used)   AS seconds,
              SUM(videos_watched) AS videos
         FROM kid_sessions
        GROUP BY day
        ORDER BY day DESC
        LIMIT ?`,
    )
    .all(days)
    .reverse()
}

export function topVideos(limit = 10, sinceDay?: string): TopVideo[] {
  const db = getDb()
  const where = sinceDay ? 'WHERE w.day >= ?' : ''
  const params = sinceDay ? [sinceDay, limit] : [limit]
  return db
    .prepare<unknown[], TopVideo>(
      `SELECT v.id                   AS videoId,
              v.title                AS title,
              v.thumbnail            AS thumbnail,
              COUNT(*)               AS plays,
              SUM(w.seconds_watched) AS seconds
         FROM watch_log w
         JOIN videos v ON v.id = w.video_id
         ${where}
        GROUP BY v.id
        ORDER BY plays DESC, seconds DESC
        LIMIT ?`,
    )
    .all(...params)
}

export interface HistoryEntry {
  id: number
  videoId: number
  title: string
  thumbnail: string | null
  profileName: string
  avatar: string
  startedAt: string
  secondsWatched: number
  completed: number
}

export function history(limit = 100, profileId?: number): HistoryEntry[] {
  const db = getDb()
  const where = profileId ? 'WHERE w.profile_id = ?' : ''
  const params = profileId ? [profileId, limit] : [limit]
  return db
    .prepare<unknown[], HistoryEntry>(
      `SELECT w.id              AS id,
              v.id              AS videoId,
              v.title           AS title,
              v.thumbnail       AS thumbnail,
              p.name            AS profileName,
              p.avatar          AS avatar,
              w.started_at      AS startedAt,
              w.seconds_watched AS secondsWatched,
              w.completed       AS completed
         FROM watch_log w
         JOIN videos v   ON v.id = w.video_id
         JOIN profiles p ON p.id = w.profile_id
         ${where}
        ORDER BY w.started_at DESC
        LIMIT ?`,
    )
    .all(...params)
}
