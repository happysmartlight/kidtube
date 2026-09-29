import type { FastifyInstance } from 'fastify'
import { getDb } from '../db/index.js'
import type { SourceRow } from '../db/types.js'
import { badRequest, conflict, notFound } from '../lib/errors.js'
import { ingestSource } from '../services/ingest.js'
import { getChannelInfo, hasApiKey } from '../services/youtube/dataapi.js'
import { channelFeedUrl, fetchFeed, playlistFeedUrl } from '../services/youtube/rss.js'
import { fetchOEmbed } from '../services/youtube/oembed.js'
import { resolveSource } from '../services/youtube/resolve.js'
import { requireParent } from './auth.js'

export async function sourceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireParent)

  app.get('/api/admin/sources', async () => {
    const rows = getDb()
      .prepare<[], SourceRow & { video_count: number; pending_count: number }>(
        `SELECT s.*,
                (SELECT COUNT(*) FROM videos v WHERE v.source_id = s.id) AS video_count,
                (SELECT COUNT(*) FROM videos v WHERE v.source_id = s.id AND v.status = 'pending') AS pending_count
           FROM sources s
          ORDER BY s.created_at DESC`,
      )
      .all()
    return { sources: rows }
  })

  /**
   * Xem truoc mot link TRUOC khi them. Bo me thay ro minh sap them cai gi —
   * quan trong vi @handle va /c/ khong the doc bang mat thuong de biet la kenh nao.
   */
  app.post<{ Body: { url?: string } }>('/api/admin/sources/preview', async (req) => {
    const input = String(req.body?.url ?? '')
    const resolved = await resolveSource(input)

    const existing = getDb()
      .prepare<[string, string], SourceRow>(
        'SELECT * FROM sources WHERE type = ? AND external_id = ?',
      )
      .get(resolved.type, resolved.externalId)

    let title = resolved.title ?? ''
    let thumbnail = resolved.thumbnail ?? null
    let sampleCount = 0
    const notes: string[] = []

    if (resolved.type === 'video') {
      const meta = await fetchOEmbed(resolved.externalId)
      if (meta) {
        title = meta.title
        thumbnail = meta.thumbnail
        sampleCount = 1
      } else {
        notes.push('Không đọc được thông tin video (có thể bị xoá hoặc để riêng tư).')
      }
    } else {
      const feedUrl =
        resolved.type === 'channel'
          ? channelFeedUrl(resolved.externalId)
          : playlistFeedUrl(resolved.externalId)
      const feed = await fetchFeed(feedUrl)
      if (feed) {
        title = title || feed.title || ''
        sampleCount = feed.videos.length
        thumbnail = thumbnail ?? feed.videos[0]?.thumbnail ?? null
        if (sampleCount === 15) {
          notes.push('RSS chỉ xem trước được 15 video mới nhất.')
        }
      } else {
        notes.push('Không đọc được RSS của nguồn này.')
      }

      if (!title && resolved.type === 'channel' && hasApiKey()) {
        const info = await getChannelInfo(resolved.externalId)
        if (info) {
          title = info.title
          thumbnail = thumbnail ?? info.thumbnail
        }
      }
    }

    return {
      resolved: { ...resolved, title: title || resolved.externalId, thumbnail },
      sampleCount,
      notes,
      alreadyExists: existing ? { id: existing.id, title: existing.title } : null,
    }
  })

  app.post<{
    Body: { url?: string; autoPull?: boolean; autoApprove?: boolean; title?: string }
  }>('/api/admin/sources', async (req, reply) => {
    const input = String(req.body?.url ?? '')
    const resolved = await resolveSource(input)
    const db = getDb()

    const existing = db
      .prepare<[string, string], SourceRow>(
        'SELECT * FROM sources WHERE type = ? AND external_id = ?',
      )
      .get(resolved.type, resolved.externalId)
    if (existing) throw conflict(`Nguồn này đã có rồi: "${existing.title}"`)

    // Lay ten cho tu te truoc khi luu — de bo me nhan ra trong danh sach.
    let title = String(req.body?.title ?? '').trim() || resolved.title || ''
    let thumbnail = resolved.thumbnail ?? null

    if (!title) {
      if (resolved.type === 'video') {
        const meta = await fetchOEmbed(resolved.externalId)
        title = meta?.title ?? resolved.externalId
        thumbnail = thumbnail ?? meta?.thumbnail ?? null
      } else {
        const feed = await fetchFeed(
          resolved.type === 'channel'
            ? channelFeedUrl(resolved.externalId)
            : playlistFeedUrl(resolved.externalId),
        )
        title = feed?.title ?? resolved.externalId
        thumbnail = thumbnail ?? feed?.videos[0]?.thumbnail ?? null
      }
    }

    const info = db
      .prepare(
        `INSERT INTO sources (type, external_id, title, thumbnail, url, auto_pull, auto_approve)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        resolved.type,
        resolved.externalId,
        title,
        thumbnail,
        resolved.url,
        req.body?.autoPull === false ? 0 : 1,
        req.body?.autoApprove === true ? 1 : 0,
      )

    const id = Number(info.lastInsertRowid)

    // Keo ngay lan dau, lay toan bo lich su neu co the.
    let ingest = null
    try {
      ingest = await ingestSource(id, { full: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      db.prepare('UPDATE sources SET last_error = ? WHERE id = ?').run(msg, id)
    }

    reply.code(201)
    return {
      source: db.prepare<[number], SourceRow>('SELECT * FROM sources WHERE id = ?').get(id),
      ingest,
    }
  })

  app.patch<{
    Params: { id: string }
    Body: { autoPull?: boolean; autoApprove?: boolean; isActive?: boolean; title?: string }
  }>('/api/admin/sources/:id', async (req) => {
    const id = Number(req.params.id)
    const db = getDb()
    const source = db
      .prepare<[number], SourceRow>('SELECT * FROM sources WHERE id = ?')
      .get(id)
    if (!source) throw notFound('Không có nguồn này')

    const b = req.body ?? {}
    db.prepare(
      `UPDATE sources SET
         auto_pull    = COALESCE(?, auto_pull),
         auto_approve = COALESCE(?, auto_approve),
         is_active    = COALESCE(?, is_active),
         title        = COALESCE(?, title)
       WHERE id = ?`,
    ).run(
      b.autoPull === undefined ? null : b.autoPull ? 1 : 0,
      b.autoApprove === undefined ? null : b.autoApprove ? 1 : 0,
      b.isActive === undefined ? null : b.isActive ? 1 : 0,
      b.title === undefined ? null : String(b.title).trim() || null,
      id,
    )
    return { source: db.prepare<[number], SourceRow>('SELECT * FROM sources WHERE id = ?').get(id) }
  })

  app.post<{ Params: { id: string }; Querystring: { full?: string } }>(
    '/api/admin/sources/:id/pull',
    async (req) => {
      const id = Number(req.params.id)
      const result = await ingestSource(id, { full: req.query.full === '1' })
      return { result }
    },
  )

  /**
   * Xoa nguon. Video da keo ve duoc GIU LAI theo mac dinh (source_id -> NULL),
   * vi bo me co the da duyet va xep vao ke roi — xoa nguon khong nen lam
   * bien mat noi dung tre dang xem.
   */
  app.delete<{ Params: { id: string }; Querystring: { withVideos?: string } }>(
    '/api/admin/sources/:id',
    async (req) => {
      const id = Number(req.params.id)
      const db = getDb()
      const source = db
        .prepare<[number], SourceRow>('SELECT * FROM sources WHERE id = ?')
        .get(id)
      if (!source) throw notFound('Không có nguồn này')

      let deletedVideos = 0
      if (req.query.withVideos === '1') {
        const info = db.prepare('DELETE FROM videos WHERE source_id = ?').run(id)
        deletedVideos = info.changes
      }
      db.prepare('DELETE FROM sources WHERE id = ?').run(id)
      return { ok: true, deletedVideos }
    },
  )

  app.post<{ Body: { url?: string } }>('/api/admin/sources/resolve', async (req) => {
    const input = String(req.body?.url ?? '')
    if (!input) throw badRequest('Chưa nhập link')
    return { resolved: await resolveSource(input) }
  })
}
