import type { FastifyInstance } from 'fastify'
import { getDb } from '../db/index.js'
import type { ProfileRow } from '../db/types.js'
import { badRequest, conflict, notFound } from '../lib/errors.js'
import { closeSession, computeQuota, grantExtraMinutes } from '../services/timeLimit.js'
import { requireParent } from './auth.js'

const HM = /^([01]\d|2[0-3]):[0-5]\d$/

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireParent)

  app.get('/api/admin/profiles', async () => {
    const profiles = getDb()
      .prepare<[], ProfileRow>('SELECT * FROM profiles ORDER BY position, id')
      .all()
    return {
      profiles: profiles.map((p) => ({ ...p, quota: computeQuota(p.id) })),
    }
  })

  app.post<{ Body: Partial<ProfileInput> }>('/api/admin/profiles', async (req, reply) => {
    const input = validate(req.body ?? {}, true)
    const db = getDb()
    const maxPos =
      db.prepare<[], { m: number | null }>('SELECT MAX(position) AS m FROM profiles').get()?.m ?? -1

    const info = db
      .prepare(
        `INSERT INTO profiles
           (name, avatar, color, daily_limit_min, session_limit_min, video_limit_session,
            allowed_from, allowed_to, autoplay, autoplay_max, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.name,
        input.avatar,
        input.color,
        input.dailyLimitMin,
        input.sessionLimitMin,
        input.videoLimitSession,
        input.allowedFrom,
        input.allowedTo,
        input.autoplay ? 1 : 0,
        input.autoplayMax,
        maxPos + 1,
      )

    reply.code(201)
    return {
      profile: db
        .prepare<[number], ProfileRow>('SELECT * FROM profiles WHERE id = ?')
        .get(Number(info.lastInsertRowid)),
    }
  })

  app.patch<{ Params: { id: string }; Body: Partial<ProfileInput> & { isActive?: boolean } }>(
    '/api/admin/profiles/:id',
    async (req) => {
      const id = Number(req.params.id)
      const db = getDb()
      const existing = db
        .prepare<[number], ProfileRow>('SELECT * FROM profiles WHERE id = ?')
        .get(id)
      if (!existing) throw notFound('Không có bé này')

      const b = req.body ?? {}
      if (b.allowedFrom !== undefined && !HM.test(String(b.allowedFrom))) {
        throw badRequest('Giờ bắt đầu phải có dạng HH:MM')
      }
      if (b.allowedTo !== undefined && !HM.test(String(b.allowedTo))) {
        throw badRequest('Giờ kết thúc phải có dạng HH:MM')
      }

      db.prepare(
        `UPDATE profiles SET
           name                = COALESCE(?, name),
           avatar              = COALESCE(?, avatar),
           color               = COALESCE(?, color),
           daily_limit_min     = COALESCE(?, daily_limit_min),
           session_limit_min   = COALESCE(?, session_limit_min),
           video_limit_session = COALESCE(?, video_limit_session),
           allowed_from        = COALESCE(?, allowed_from),
           allowed_to          = COALESCE(?, allowed_to),
           autoplay            = COALESCE(?, autoplay),
           autoplay_max        = COALESCE(?, autoplay_max),
           is_active           = COALESCE(?, is_active)
         WHERE id = ?`,
      ).run(
        b.name === undefined ? null : String(b.name).trim() || null,
        b.avatar === undefined ? null : String(b.avatar),
        b.color === undefined ? null : String(b.color),
        nonNegOrNull(b.dailyLimitMin),
        nonNegOrNull(b.sessionLimitMin),
        nonNegOrNull(b.videoLimitSession),
        b.allowedFrom === undefined ? null : String(b.allowedFrom),
        b.allowedTo === undefined ? null : String(b.allowedTo),
        b.autoplay === undefined ? null : b.autoplay ? 1 : 0,
        nonNegOrNull(b.autoplayMax),
        b.isActive === undefined ? null : b.isActive ? 1 : 0,
        id,
      )

      return {
        profile: db.prepare<[number], ProfileRow>('SELECT * FROM profiles WHERE id = ?').get(id),
      }
    },
  )

  app.delete<{ Params: { id: string } }>('/api/admin/profiles/:id', async (req) => {
    const db = getDb()
    const n = db.prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM profiles').get()?.n ?? 0
    if (n <= 1) throw conflict('Phải giữ lại ít nhất một bé')

    const info = db.prepare('DELETE FROM profiles WHERE id = ?').run(Number(req.params.id))
    if (info.changes === 0) throw notFound('Không có bé này')
    return { ok: true }
  })

  /** Cap them gio cho be — nut "cho xem thêm" trong admin. */
  app.post<{ Params: { id: string }; Body: { minutes?: number } }>(
    '/api/admin/profiles/:id/grant',
    async (req) => {
      const id = Number(req.params.id)
      const minutes = Number(req.body?.minutes ?? 10)
      if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 240) {
        throw badRequest('Số phút phải từ 1 đến 240')
      }
      grantExtraMinutes(id, minutes)
      return { ok: true, quota: computeQuota(id) }
    },
  )

  /** Ket thuc phien xem cua be ngay lap tuc. */
  app.post<{ Params: { id: string } }>('/api/admin/profiles/:id/end-session', async (req) => {
    const id = Number(req.params.id)
    closeSession(id)
    return { ok: true, quota: computeQuota(id) }
  })
}

interface ProfileInput {
  name: string
  avatar: string
  color: string
  dailyLimitMin: number
  sessionLimitMin: number
  videoLimitSession: number
  allowedFrom: string
  allowedTo: string
  autoplay: boolean
  autoplayMax: number
}

function nonNegOrNull(v: unknown): number | null {
  if (v === undefined || v === null) return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

function validate(b: Partial<ProfileInput>, requireName: boolean): ProfileInput {
  const name = String(b.name ?? '').trim()
  if (requireName && !name) throw badRequest('Chưa đặt tên cho bé')

  const allowedFrom = String(b.allowedFrom ?? '07:00')
  const allowedTo = String(b.allowedTo ?? '20:00')
  if (!HM.test(allowedFrom)) throw badRequest('Giờ bắt đầu phải có dạng HH:MM')
  if (!HM.test(allowedTo)) throw badRequest('Giờ kết thúc phải có dạng HH:MM')

  return {
    name,
    avatar: String(b.avatar ?? '🐻'),
    color: String(b.color ?? '#5b9cff'),
    dailyLimitMin: nonNegOrNull(b.dailyLimitMin) ?? 30,
    sessionLimitMin: nonNegOrNull(b.sessionLimitMin) ?? 15,
    videoLimitSession: nonNegOrNull(b.videoLimitSession) ?? 0,
    allowedFrom,
    allowedTo,
    autoplay: b.autoplay === true,
    autoplayMax: nonNegOrNull(b.autoplayMax) ?? 3,
  }
}
