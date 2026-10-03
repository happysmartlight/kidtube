import { existsSync, statSync, unlinkSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { env } from '../env.js'
import { getDb, getSettingBool, getSettingInt } from '../db/index.js'
import type { DownloadQueueRow, VideoRow } from '../db/types.js'
import { sqlNow } from '../lib/time.js'
import { downloadVideo, ytdlpAvailable } from './youtube/ytdlp.js'

/**
 * Worker tai offline.
 *
 * Concurrency = 1 co chu dich: Pi 5 ghi SSD qua USB3 va co the phai remux
 * bang ffmpeg. Chay song song lam nghen I/O va anh huong den video dang phat.
 * Mot job moi lan la du (~1-2 phut cho video 720p).
 */

let busy = false
let currentVideoId: number | null = null

export function isBusy(): boolean {
  return busy
}

export function currentJob(): number | null {
  return currentVideoId
}

/** Xep hang mot video de tai. Idempotent. */
export function enqueue(videoId: number, priority = 0): { queued: boolean; reason?: string } {
  const db = getDb()
  const video = db
    .prepare<[number], VideoRow>('SELECT * FROM videos WHERE id = ?')
    .get(videoId)
  if (!video) return { queued: false, reason: 'Không có video này' }
  if (video.local_path && existsSync(join(env.mediaDir, video.local_path))) {
    return { queued: false, reason: 'Video đã có bản tải về' }
  }

  db.prepare(
    `INSERT INTO download_queue (video_id, priority, status)
     VALUES (?, ?, 'queued')
     ON CONFLICT(video_id) DO UPDATE SET
       status   = CASE WHEN download_queue.status IN ('error','cancelled')
                       THEN 'queued' ELSE download_queue.status END,
       priority = MAX(download_queue.priority, excluded.priority),
       error    = NULL`,
  ).run(videoId, priority)

  db.prepare(
    "UPDATE videos SET download_status = 'queued', download_error = NULL WHERE id = ? AND download_status NOT IN ('done','downloading')",
  ).run(videoId)

  return { queued: true }
}

export function cancel(videoId: number): void {
  const db = getDb()
  db.prepare(
    "UPDATE download_queue SET status = 'cancelled', finished_at = ? WHERE video_id = ? AND status = 'queued'",
  ).run(sqlNow(), videoId)
  db.prepare(
    "UPDATE videos SET download_status = 'none', download_progress = 0 WHERE id = ? AND download_status = 'queued'",
  ).run(videoId)
}

/** Xoa file da tai va tra video ve trang thai chi-stream. */
export function removeLocalFile(videoId: number): boolean {
  const db = getDb()
  const video = db
    .prepare<[number], VideoRow>('SELECT * FROM videos WHERE id = ?')
    .get(videoId)
  if (!video?.local_path) return false

  const abs = join(env.mediaDir, video.local_path)
  try {
    if (existsSync(abs)) unlinkSync(abs)
  } catch {
    /* file co the dang bi khoa — van xoa tham chieu trong DB */
  }

  db.prepare(
    "UPDATE videos SET local_path = NULL, file_size = NULL, download_status = 'none', download_progress = 0 WHERE id = ?",
  ).run(videoId)
  db.prepare('DELETE FROM download_queue WHERE video_id = ?').run(videoId)
  return true
}

/**
 * Chay mot job neu worker dang ranh. Cron goi ham nay moi 30 giay.
 * Tra ve true neu co job duoc chay.
 */
export async function tick(): Promise<boolean> {
  if (busy) return false
  if (!getSettingBool('offline_enabled', false)) return false
  if (!(await ytdlpAvailable())) return false

  const db = getDb()
  const job = db
    .prepare<[], DownloadQueueRow>(
      "SELECT * FROM download_queue WHERE status = 'queued' ORDER BY priority DESC, created_at ASC LIMIT 1",
    )
    .get()
  if (!job) return false

  const video = db
    .prepare<[number], VideoRow>('SELECT * FROM videos WHERE id = ?')
    .get(job.video_id)
  if (!video) {
    db.prepare('DELETE FROM download_queue WHERE id = ?').run(job.id)
    return false
  }

  busy = true
  currentVideoId = video.id

  db.prepare(
    "UPDATE download_queue SET status = 'running', started_at = ?, attempts = attempts + 1 WHERE id = ?",
  ).run(sqlNow(), job.id)
  db.prepare(
    "UPDATE videos SET download_status = 'downloading', download_progress = 0, download_error = NULL WHERE id = ?",
  ).run(video.id)

  // yt-dlp tu chon duoi file; %(ext)s se thanh mp4 sau khi merge.
  const template = join(env.mediaDir, `${video.youtube_id}.%(ext)s`)

  let lastWrite = 0
  const result = await downloadVideo(video.youtube_id, {
    outputTemplate: template,
    maxHeight: env.downloadMaxHeight,
    onProgress: (percent) => {
      // Ghi DB toi da 1 lan/giay — yt-dlp ban tien do rat day.
      const now = Date.now()
      if (now - lastWrite < 1000) return
      lastWrite = now
      db.prepare('UPDATE videos SET download_progress = ? WHERE id = ?').run(percent, video.id)
    },
  })

  if (result.ok) {
    const found = await findDownloadedFile(video.youtube_id)
    if (found) {
      const size = statSync(join(env.mediaDir, found)).size
      db.prepare(
        "UPDATE videos SET local_path = ?, file_size = ?, download_status = 'done', download_progress = 100, download_error = NULL WHERE id = ?",
      ).run(found, size, video.id)
      db.prepare("UPDATE download_queue SET status = 'done', finished_at = ? WHERE id = ?").run(
        sqlNow(),
        job.id,
      )
    } else {
      failJob(job.id, video.id, 'yt-dlp báo thành công nhưng không tìm thấy file')
    }
  } else {
    failJob(job.id, video.id, result.error ?? 'Lỗi không rõ')
  }

  busy = false
  currentVideoId = null

  await enforceStorageLimit()
  return true
}

function failJob(jobId: number, videoId: number, error: string): void {
  const db = getDb()
  db.prepare(
    "UPDATE download_queue SET status = 'error', error = ?, finished_at = ? WHERE id = ?",
  ).run(error, sqlNow(), jobId)
  db.prepare(
    "UPDATE videos SET download_status = 'error', download_error = ?, download_progress = 0 WHERE id = ?",
  ).run(error, videoId)
}

/**
 * Tim file yt-dlp vua tao. Khong doan duoi file — yt-dlp co the ra mkv/webm
 * neu khong merge duoc thanh mp4.
 */
async function findDownloadedFile(youtubeId: string): Promise<string | null> {
  try {
    const entries = await readdir(env.mediaDir)
    const match = entries.find(
      (f) => f.startsWith(`${youtubeId}.`) && !f.endsWith('.part') && !f.endsWith('.ytdl'),
    )
    return match ?? null
  } catch {
    return null
  }
}

export interface StorageInfo {
  usedBytes: number
  limitBytes: number
  fileCount: number
}

export function storageInfo(): StorageInfo {
  const row = getDb()
    .prepare<[], { total: number | null; n: number }>(
      "SELECT SUM(file_size) AS total, COUNT(*) AS n FROM videos WHERE download_status = 'done' AND local_path IS NOT NULL",
    )
    .get()
  return {
    usedBytes: row?.total ?? 0,
    limitBytes: getSettingInt('offline_max_gb', 20) * 1024 * 1024 * 1024,
    fileCount: row?.n ?? 0,
  }
}

/**
 * Ep giai phong dung luong khi vuot han muc.
 * Xoa video IT XEM NHAT truoc; hoa thi xoa cai tai lau nhat.
 */
export async function enforceStorageLimit(): Promise<number> {
  const info = storageInfo()
  if (info.limitBytes <= 0 || info.usedBytes <= info.limitBytes) return 0

  const db = getDb()
  const candidates = db
    .prepare<[], { id: number; file_size: number | null }>(
      `SELECT v.id, v.file_size
         FROM videos v
        WHERE v.download_status = 'done'
          AND v.local_path IS NOT NULL
        ORDER BY v.watch_count ASC, v.last_watched_at ASC NULLS FIRST, v.added_at ASC`,
    )
    .all()

  let freed = 0
  let removed = 0
  for (const c of candidates) {
    if (info.usedBytes - freed <= info.limitBytes) break
    if (removeLocalFile(c.id)) {
      freed += c.file_size ?? 0
      removed++
    }
  }
  return removed
}

/** Xoa file trong media/ khong con video nao tham chieu toi. */
export async function cleanupOrphanFiles(): Promise<number> {
  let entries: string[]
  try {
    entries = await readdir(env.mediaDir)
  } catch {
    return 0
  }

  const known = new Set(
    getDb()
      .prepare<[], { local_path: string }>(
        'SELECT local_path FROM videos WHERE local_path IS NOT NULL',
      )
      .all()
      .map((r) => r.local_path),
  )

  let removed = 0
  for (const name of entries) {
    if (known.has(name)) continue
    // File .part la cua job dang chay — dung dong vao.
    if (name.endsWith('.part') || name.endsWith('.ytdl')) continue
    try {
      unlinkSync(join(env.mediaDir, name))
      removed++
    } catch {
      /* bo qua */
    }
  }
  return removed
}

/**
 * Doi trang thai 'running' mac ket ve 'queued' khi khoi dong.
 * Xay ra khi server bi tat dot ngot giua chung mot job.
 */
export function recoverStuckJobs(): number {
  const db = getDb()
  const info = db
    .prepare(
      "UPDATE download_queue SET status = 'queued' WHERE status = 'running'",
    )
    .run()
  db.prepare(
    "UPDATE videos SET download_status = 'queued', download_progress = 0 WHERE download_status = 'downloading'",
  ).run()
  return info.changes
}
