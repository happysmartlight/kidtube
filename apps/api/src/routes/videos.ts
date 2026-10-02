import type { FastifyInstance } from 'fastify'
import { getDb } from '../db/index.js'
import type { VideoRow, VideoStatus } from '../db/types.js'
import { badRequest, notFound } from '../lib/errors.js'
import { searchClause } from '../lib/search.js'
import { sqlNow } from '../lib/time.js'
import { activeRules, evaluate } from '../services/autofilter.js'
import { enqueue } from '../services/downloader.js'
import { requireParent } from './auth.js'

const VALID_STATUS: VideoStatus[] = ['pending', 'approved', 'rejected', 'later']

function isStatus(s: string): s is VideoStatus {
  return (VALID_STATUS as string[]).includes(s)
}

export async function videoRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireParent)

  app.get<{
    Querystring: {
      status?: string
      sourceId?: string
      q?: string
      limit?: string
      offset?: string
      sort?: string
    }
  }>('/api/admin/videos', async (req) => {
    const db = getDb()
    const where: string[] = []
    const params: unknown[] = []

    const status = req.query.status
    if (status && status !== 'all') {
      if (!isStatus(status)) throw badRequest(`Trạng thái không hợp lệ: ${status}`)
      where.push('v.status = ?')
      params.push(status)
    }
    if (req.query.sourceId) {
      where.push('v.source_id = ?')
      params.push(Number(req.query.sourceId))
    }
    // Tim kiem bo dau + nhieu tu khoa (AND). Xem lib/search.ts.
    const search = searchClause(req.query.q, 'v.search_text')
    if (search) {
      where.push(`(${search.sql})`)
      params.push(...search.params)
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
    const limit = Math.min(Math.max(Number(req.query.limit ?? 60) || 60, 1), 500)
    const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0)

    const sort =
      req.query.sort === 'oldest'
        ? 'v.published_at ASC'
        : req.query.sort === 'longest'
          ? 'v.duration_sec DESC'
          : req.query.sort === 'shortest'
            ? 'v.duration_sec ASC'
            : 'COALESCE(v.published_at, v.added_at) DESC'

    const rows = db
      .prepare<unknown[], VideoRow & { source_title: string | null; shelf_count: number }>(
        `SELECT v.*,
                s.title AS source_title,
                (SELECT COUNT(*) FROM shelf_items si WHERE si.video_id = v.id) AS shelf_count
           FROM videos v
           LEFT JOIN sources s ON s.id = v.source_id
           ${whereSql}
          ORDER BY ${sort}
          LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset)

    const total =
      db
        .prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM videos v ${whereSql}`)
        .get(...params)?.n ?? 0

    const counts = db
      .prepare<[], { status: VideoStatus; n: number }>(
        'SELECT status, COUNT(*) AS n FROM videos GROUP BY status',
      )
      .all()

    return {
      videos: rows,
      total,
      offset,
      limit,
      // Client dung cai nay cho nut "Tai them" — khoi phai tu tinh.
      hasMore: offset + rows.length < total,
      counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
    }
  })

  app.patch<{ Params: { id: string }; Body: { status?: string; enqueueDownload?: boolean } }>(
    '/api/admin/videos/:id',
    async (req) => {
      const id = Number(req.params.id)
      const db = getDb()
      const video = db.prepare<[number], VideoRow>('SELECT * FROM videos WHERE id = ?').get(id)
      if (!video) throw notFound('Không có video này')

      const status = String(req.body?.status ?? '')
      if (!isStatus(status)) throw badRequest(`Trạng thái không hợp lệ: ${status}`)

      db.prepare(
        'UPDATE videos SET status = ?, reviewed_at = ?, reject_reason = CASE WHEN ? = \'rejected\' THEN reject_reason ELSE NULL END WHERE id = ?',
      ).run(status, sqlNow(), status, id)

      if (status === 'approved' && req.body?.enqueueDownload) enqueue(id, 5)

      return { video: db.prepare<[number], VideoRow>('SELECT * FROM videos WHERE id = ?').get(id) }
    },
  )

  /** Duyet hang loat — thao tac chinh cua bo me khi xu ly hang cho. */
  app.post<{ Body: { ids?: number[]; status?: string; enqueueDownload?: boolean } }>(
    '/api/admin/videos/bulk',
    async (req) => {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : []
      const status = String(req.body?.status ?? '')
      if (ids.length === 0) throw badRequest('Chưa chọn video nào')
      if (!isStatus(status)) throw badRequest(`Trạng thái không hợp lệ: ${status}`)

      const db = getDb()
      const stmt = db.prepare(
        'UPDATE videos SET status = ?, reviewed_at = ?, reject_reason = NULL WHERE id = ?',
      )
      const now = sqlNow()
      const tx = db.transaction((list: number[]) => {
        for (const id of list) stmt.run(status, now, id)
      })
      tx(ids)

      if (status === 'approved' && req.body?.enqueueDownload) {
        for (const id of ids) enqueue(id, 5)
      }

      return { ok: true, updated: ids.length }
    },
  )

  /**
   * Chay lai bo loc tu dong tren cac video dang cho.
   * Dung khi bo me vua them mot rule moi va muon ap dung nguoc lai.
   */
  app.post<{ Body: { onlyPending?: boolean } }>('/api/admin/videos/refilter', async (req) => {
    const db = getDb()
    const onlyPending = req.body?.onlyPending !== false
    const rows = db
      .prepare<[], VideoRow>(
        onlyPending
          ? "SELECT * FROM videos WHERE status = 'pending'"
          : "SELECT * FROM videos WHERE status IN ('pending','approved')",
      )
      .all()

    const rules = activeRules()
    const update = db.prepare(
      "UPDATE videos SET status = 'rejected', reject_reason = ?, reviewed_at = ? WHERE id = ?",
    )
    const now = sqlNow()
    let blocked = 0

    const tx = db.transaction(() => {
      for (const v of rows) {
        const verdict = evaluate(
          {
            youtubeId: v.youtube_id,
            title: v.title,
            thumbnail: v.thumbnail,
            durationSec: v.duration_sec,
            channelId: v.channel_id,
            channelTitle: v.channel_title,
            publishedAt: v.published_at,
            isLive: v.is_live === 1,
            embeddable: v.embeddable === null ? null : v.embeddable === 1,
          },
          rules,
        )
        if (verdict.blocked) {
          update.run(verdict.reason ?? 'Bộ lọc tự động', now, v.id)
          blocked++
        }
      }
    })
    tx()

    return { ok: true, scanned: rows.length, blocked }
  })

  app.delete<{ Params: { id: string } }>('/api/admin/videos/:id', async (req) => {
    const db = getDb()
    const info = db.prepare('DELETE FROM videos WHERE id = ?').run(Number(req.params.id))
    if (info.changes === 0) throw notFound('Không có video này')
    return { ok: true }
  })
}
