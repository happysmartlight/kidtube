import type { FastifyInstance } from 'fastify'
import { getDb } from '../db/index.js'
import type { ShelfRow, VideoRow } from '../db/types.js'
import { badRequest, notFound } from '../lib/errors.js'
import { requireParent, reverifyParent } from './auth.js'

export async function shelfRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireParent)

  app.get('/api/admin/shelves', async () => {
    const db = getDb()
    const shelves = db
      .prepare<[], ShelfRow & { item_count: number }>(
        `SELECT s.*, (SELECT COUNT(*) FROM shelf_items si WHERE si.shelf_id = s.id) AS item_count
           FROM shelves s ORDER BY s.position, s.id`,
      )
      .all()

    const assignments = db
      .prepare<[], { shelf_id: number; profile_id: number }>(
        'SELECT shelf_id, profile_id FROM profile_shelves',
      )
      .all()

    return {
      shelves: shelves.map((s) => ({
        ...s,
        // Mang rong = ke hien cho MOI be (xem REQUIREMENTS muc 4.4).
        profileIds: assignments.filter((a) => a.shelf_id === s.id).map((a) => a.profile_id),
      })),
    }
  })

  app.get<{ Params: { id: string } }>('/api/admin/shelves/:id/items', async (req) => {
    const id = Number(req.params.id)
    const db = getDb()
    const shelf = db.prepare<[number], ShelfRow>('SELECT * FROM shelves WHERE id = ?').get(id)
    if (!shelf) throw notFound('Không có kệ này')

    const items = db
      .prepare<[number], VideoRow & { position: number; item_id: number }>(
        `SELECT v.*, si.position AS position, si.id AS item_id
           FROM shelf_items si
           JOIN videos v ON v.id = si.video_id
          WHERE si.shelf_id = ?
          ORDER BY si.position, si.id`,
      )
      .all(id)

    return { shelf, items }
  })

  app.post<{ Body: { title?: string; emoji?: string; color?: string } }>(
    '/api/admin/shelves',
    async (req, reply) => {
      const title = String(req.body?.title ?? '').trim()
      if (!title) throw badRequest('Chưa đặt tên kệ')

      const db = getDb()
      const maxPos =
        db.prepare<[], { m: number | null }>('SELECT MAX(position) AS m FROM shelves').get()?.m ?? -1

      const info = db
        .prepare('INSERT INTO shelves (title, emoji, color, position) VALUES (?, ?, ?, ?)')
        .run(title, String(req.body?.emoji ?? '⭐'), String(req.body?.color ?? '#5b9cff'), maxPos + 1)

      reply.code(201)
      return {
        shelf: db
          .prepare<[number], ShelfRow>('SELECT * FROM shelves WHERE id = ?')
          .get(Number(info.lastInsertRowid)),
      }
    },
  )

  app.patch<{
    Params: { id: string }
    Body: { title?: string; emoji?: string; color?: string; isActive?: boolean; profileIds?: number[] }
  }>('/api/admin/shelves/:id', async (req) => {
    const id = Number(req.params.id)
    const db = getDb()
    const shelf = db.prepare<[number], ShelfRow>('SELECT * FROM shelves WHERE id = ?').get(id)
    if (!shelf) throw notFound('Không có kệ này')

    const b = req.body ?? {}
    db.prepare(
      `UPDATE shelves SET
         title     = COALESCE(?, title),
         emoji     = COALESCE(?, emoji),
         color     = COALESCE(?, color),
         is_active = COALESCE(?, is_active)
       WHERE id = ?`,
    ).run(
      b.title === undefined ? null : String(b.title).trim() || null,
      b.emoji === undefined ? null : String(b.emoji),
      b.color === undefined ? null : String(b.color),
      b.isActive === undefined ? null : b.isActive ? 1 : 0,
      id,
    )

    if (Array.isArray(b.profileIds)) {
      const tx = db.transaction((ids: number[]) => {
        db.prepare('DELETE FROM profile_shelves WHERE shelf_id = ?').run(id)
        const ins = db.prepare(
          'INSERT OR IGNORE INTO profile_shelves (profile_id, shelf_id) VALUES (?, ?)',
        )
        for (const pid of ids) ins.run(pid, id)
      })
      tx(b.profileIds.map(Number).filter(Number.isFinite))
    }

    return { shelf: db.prepare<[number], ShelfRow>('SELECT * FROM shelves WHERE id = ?').get(id) }
  })

  app.delete<{ Params: { id: string } }>('/api/admin/shelves/:id', async (req) => {
    const info = getDb().prepare('DELETE FROM shelves WHERE id = ?').run(Number(req.params.id))
    if (info.changes === 0) throw notFound('Không có kệ này')
    return { ok: true }
  })

  /** Sap xep lai thu tu cac ke tren trang chu. */
  app.post<{ Body: { order?: number[] } }>('/api/admin/shelves/reorder', async (req) => {
    const order = Array.isArray(req.body?.order) ? req.body.order.map(Number) : []
    if (order.length === 0) throw badRequest('Danh sách thứ tự rỗng')

    const db = getDb()
    const stmt = db.prepare('UPDATE shelves SET position = ? WHERE id = ?')
    const tx = db.transaction((ids: number[]) => {
      ids.forEach((id, i) => stmt.run(i, id))
    })
    tx(order)
    return { ok: true }
  })

  /**
   * Them video vao ke. Bo qua video da co san (khong bao loi).
   *
   * Hai cach goi:
   *   - `videoIds`: danh sach cu the, bo me tu tich tung cai
   *   - `sourceId`: TAT CA video DA DUYET cua mot kenh — xep ca kenh vao ke
   *     bang mot thao tac thay vi tich hang tram o
   *
   * Chi lay video `approved`: video dang cho duyet ma vao ke thi tre van
   * khong thay (tang cua thu nhat chan lai), chi lam ke trong admin ro ram.
   */
  app.post<{ Params: { id: string }; Body: { videoIds?: number[]; sourceId?: number } }>(
    '/api/admin/shelves/:id/items',
    async (req) => {
      const shelfId = Number(req.params.id)
      const db = getDb()
      const shelf = db.prepare<[number], ShelfRow>('SELECT * FROM shelves WHERE id = ?').get(shelfId)
      if (!shelf) throw notFound('Không có kệ này')

      let ids = Array.isArray(req.body?.videoIds)
        ? req.body.videoIds.map(Number).filter(Number.isFinite)
        : []

      const sourceId = Number(req.body?.sourceId)
      if (Number.isFinite(sourceId) && sourceId > 0) {
        const source = db
          .prepare<[number], { id: number }>('SELECT id FROM sources WHERE id = ?')
          .get(sourceId)
        if (!source) throw notFound('Không có kênh này')

        const fromSource = db
          .prepare<[number], { id: number }>(
            `SELECT v.id
               FROM videos v
              WHERE v.source_id = ?
                AND v.status = 'approved'
              ORDER BY COALESCE(v.published_at, v.added_at) DESC`,
          )
          .all(sourceId)
          .map((r) => r.id)

        if (fromSource.length === 0) {
          throw badRequest('Kênh này chưa có video nào đã duyệt')
        }
        ids = [...ids, ...fromSource]
      }

      // Bo trung: bo me co the vua tich vai video vua them ca kenh chua
      // chinh nhung video do. Khong bo thi `skipped` dem sai.
      ids = [...new Set(ids)]

      if (ids.length === 0) throw badRequest('Chưa chọn video nào')

      let maxPos =
        db
          .prepare<[number], { m: number | null }>(
            'SELECT MAX(position) AS m FROM shelf_items WHERE shelf_id = ?',
          )
          .get(shelfId)?.m ?? -1

      const ins = db.prepare(
        'INSERT OR IGNORE INTO shelf_items (shelf_id, video_id, position) VALUES (?, ?, ?)',
      )
      let added = 0
      const tx = db.transaction((list: number[]) => {
        for (const vid of list) {
          const info = ins.run(shelfId, vid, ++maxPos)
          if (info.changes > 0) added++
        }
      })
      tx(ids)

      return { ok: true, added, skipped: ids.length - added }
    },
  )

  app.delete<{ Params: { id: string; videoId: string } }>(
    '/api/admin/shelves/:id/items/:videoId',
    async (req) => {
      const info = getDb()
        .prepare('DELETE FROM shelf_items WHERE shelf_id = ? AND video_id = ?')
        .run(Number(req.params.id), Number(req.params.videoId))
      if (info.changes === 0) throw notFound('Video không nằm trong kệ này')
      return { ok: true }
    },
  )

  /**
   * Thao HET video khoi ke — de bo me xep lai ke tu dau. Video khong bi xoa,
   * van o trang thai da duyet; ke giu nguyen ten, mau, be duoc gan.
   *
   * Bat nhap lai PIN du da co phien: mot cu bam la mat ca ke da sap cong phu.
   */
  app.post<{ Params: { id: string }; Body: { pin?: string } }>(
    '/api/admin/shelves/:id/clear',
    async (req) => {
      const shelfId = Number(req.params.id)
      const db = getDb()
      const shelf = db.prepare<[number], ShelfRow>('SELECT * FROM shelves WHERE id = ?').get(shelfId)
      if (!shelf) throw notFound('Không có kệ này')

      reverifyParent(req, req.body?.pin)

      const info = db.prepare('DELETE FROM shelf_items WHERE shelf_id = ?').run(shelfId)
      return { ok: true, removed: info.changes }
    },
  )

  /** Sap xep lai thu tu video trong mot ke (keo-tha). */
  app.post<{ Params: { id: string }; Body: { order?: number[] } }>(
    '/api/admin/shelves/:id/reorder',
    async (req) => {
      const shelfId = Number(req.params.id)
      const order = Array.isArray(req.body?.order) ? req.body.order.map(Number) : []
      if (order.length === 0) throw badRequest('Danh sách thứ tự rỗng')

      const db = getDb()
      const stmt = db.prepare(
        'UPDATE shelf_items SET position = ? WHERE shelf_id = ? AND video_id = ?',
      )
      const tx = db.transaction((ids: number[]) => {
        ids.forEach((videoId, i) => stmt.run(i, shelfId, videoId))
      })
      tx(order)
      return { ok: true }
    },
  )
}
