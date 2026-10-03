import type { FastifyInstance } from 'fastify'
import { getDb, getSettingBool } from '../db/index.js'
import type { DownloadQueueRow, VideoRow } from '../db/types.js'
import { badRequest } from '../lib/errors.js'
import {
  cancel,
  cleanupOrphanFiles,
  currentJob,
  enforceStorageLimit,
  enqueue,
  isBusy,
  removeLocalFile,
  storageInfo,
  tick,
} from '../services/downloader.js'
import { ytdlpAvailable } from '../services/youtube/ytdlp.js'
import { requireParent } from './auth.js'

/** Nhac bo me khi hang doi se nam im vi cong tac tong dang tat. */
function offlineNotice(): string | null {
  return getSettingBool('offline_enabled', false)
    ? null
    : 'Chế độ tải offline đang TẮT. Bật trong Cài đặt → Tải video về máy thì hàng đợi mới chạy.'
}

export async function downloadRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireParent)

  app.get('/api/admin/downloads', async () => {
    const db = getDb()
    const queue = db
      .prepare<[], DownloadQueueRow & { title: string; thumbnail: string | null; progress: number }>(
        `SELECT q.*, v.title AS title, v.thumbnail AS thumbnail, v.download_progress AS progress
           FROM download_queue q
           JOIN videos v ON v.id = q.video_id
          WHERE q.status IN ('queued','running','error')
          ORDER BY CASE q.status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
                   q.priority DESC, q.created_at ASC`,
      )
      .all()

    const downloaded = db
      .prepare<[], Pick<VideoRow, 'id' | 'title' | 'thumbnail' | 'file_size' | 'local_path' | 'watch_count'>>(
        `SELECT id, title, thumbnail, file_size, local_path, watch_count
           FROM videos
          WHERE download_status = 'done' AND local_path IS NOT NULL
          ORDER BY file_size DESC`,
      )
      .all()

    return {
      queue,
      downloaded,
      storage: storageInfo(),
      worker: {
        busy: isBusy(),
        currentVideoId: currentJob(),
        offlineEnabled: getSettingBool('offline_enabled', false),
        ytdlpAvailable: await ytdlpAvailable(),
      },
    }
  })

  app.post<{ Body: { videoIds?: number[]; priority?: number } }>(
    '/api/admin/downloads',
    async (req) => {
      const ids = Array.isArray(req.body?.videoIds)
        ? req.body.videoIds.map(Number).filter(Number.isFinite)
        : []
      if (ids.length === 0) throw badRequest('Chưa chọn video nào')

      const priority = Number(req.body?.priority ?? 0) || 0
      const results = ids.map((id) => ({ videoId: id, ...enqueue(id, priority) }))

      // Chay ngay thay vi doi cron — bo me vua bam thi muon thay tien do lien.
      void tick().catch(() => {})

      return { results, notice: offlineNotice() }
    },
  )

  app.delete<{ Params: { videoId: string } }>('/api/admin/downloads/:videoId', async (req) => {
    cancel(Number(req.params.videoId))
    return { ok: true }
  })

  /** Xoa file da tai (video van xem duoc qua stream). */
  app.delete<{ Params: { videoId: string } }>('/api/admin/downloads/:videoId/file', async (req) => {
    const removed = removeLocalFile(Number(req.params.videoId))
    return { ok: removed }
  })

  app.post('/api/admin/downloads/cleanup', async () => {
    const orphans = await cleanupOrphanFiles()
    const evicted = await enforceStorageLimit()
    return { ok: true, orphansRemoved: orphans, evictedForSpace: evicted }
  })

  /** Chay tay mot vong worker — huu ich khi go loi. */
  app.post('/api/admin/downloads/tick', async () => ({ ran: await tick() }))
}
