import type { FastifyInstance } from 'fastify'
import { localDay } from '../lib/time.js'
import { dashboard, history, recentDays, summaryForDay, topVideos } from '../services/stats.js'
import { requireParent } from './auth.js'

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireParent)

  app.get('/api/admin/stats', async () => dashboard())

  app.get<{ Querystring: { days?: string } }>('/api/admin/stats/days', async (req) => ({
    days: recentDays(Math.min(Number(req.query.days ?? 14) || 14, 90)),
  }))

  app.get<{ Querystring: { day?: string } }>('/api/admin/stats/day', async (req) => {
    const day = req.query.day ?? localDay()
    return { day, profiles: summaryForDay(day) }
  })

  app.get<{ Querystring: { limit?: string; since?: string } }>(
    '/api/admin/stats/top',
    async (req) => ({
      videos: topVideos(Math.min(Number(req.query.limit ?? 10) || 10, 50), req.query.since),
    }),
  )

  app.get<{ Querystring: { limit?: string; profileId?: string } }>(
    '/api/admin/stats/history',
    async (req) => ({
      entries: history(
        Math.min(Number(req.query.limit ?? 100) || 100, 500),
        req.query.profileId ? Number(req.query.profileId) : undefined,
      ),
    }),
  )
}
