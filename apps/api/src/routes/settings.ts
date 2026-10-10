import type { FastifyInstance } from 'fastify'
import { env } from '../env.js'
import { getAllSettings, getDb, getSetting, setSetting } from '../db/index.js'
import type { FilterRuleRow, FilterType } from '../db/types.js'
import { badRequest, notFound } from '../lib/errors.js'
import { storageInfo } from '../services/downloader.js'
import { hasApiKey } from '../services/youtube/dataapi.js'
import { ytdlpAvailable, ytdlpVersion } from '../services/youtube/ytdlp.js'
import { requireParent } from './auth.js'

/** Chi cac key nay duoc ghi qua API — tranh bo me lo ghi de pin_hash. */
const WRITABLE = new Set([
  'autoplay_default',
  'autoplay_max',
  'offline_enabled',
  'offline_max_gb',
  'ui_mode_override',
  'sfx_enabled',
  'warn_before_min',
  'pull_interval_hours',
  'show_duration',
  'show_download_badge',
])

/** Ten MagicDNS cua Tailscale: <may>.<tailnet>.ts.net, co the kem cong. */
const TAILSCALE_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.ts\.net(:\d{1,5})?$/i

const FILTER_TYPES: FilterType[] = [
  'keyword_block',
  'max_duration',
  'min_duration',
  'block_live',
  'title_regex',
]

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireParent)

  app.get('/api/admin/settings', async () => {
    const all = getAllSettings()
    // Khong bao gio tra PIN ra ngoai.
    delete all.pin_hash
    delete all.pin_salt

    return {
      settings: all,
      system: {
        ytdlpAvailable: await ytdlpAvailable(),
        ytdlpVersion: await ytdlpVersion(),
        hasApiKey: hasApiKey(),
        mediaDir: env.mediaDir,
        dataDir: env.dataDir,
        downloadMaxHeight: env.downloadMaxHeight,
        storage: storageInfo(),
        nodeVersion: process.version,
      },
    }
  })

  app.patch<{ Body: Record<string, unknown> }>('/api/admin/settings', async (req) => {
    const body = req.body ?? {}
    const applied: string[] = []
    const ignored: string[] = []

    for (const [key, value] of Object.entries(body)) {
      if (!WRITABLE.has(key)) {
        ignored.push(key)
        continue
      }
      const str = typeof value === 'boolean' ? (value ? '1' : '0') : String(value)
      setSetting(key, str)
      applied.push(key)
    }

    if (applied.length === 0 && ignored.length > 0) {
      throw badRequest(`Không có cài đặt nào hợp lệ. Bỏ qua: ${ignored.join(', ')}`)
    }
    return { ok: true, applied, ignored }
  })

  /**
   * Dia chi HTTPS de cai app (PWA) — trinh duyet chi cho cai qua HTTPS duoc tin.
   *
   * Khong tu lam HTTPS: Pi da co Tailscale, `tailscale serve` cap chung chi
   * that cho <may>.<tailnet>.ts.net va chuyen vao cong HTTP cua app. Bo me mo
   * trang nay qua dia chi do mot lan la server nho lai, de chi duong cho may
   * dang mo bang http://<ip> trong LAN.
   *
   * Nhan ra qua header Tailscale gan vao: X-Forwarded-Proto chi la "https" khi
   * ket noi den Tailscale co TLS, Host giu nguyen (trustProxy dang bat). Route
   * nay sau requireParent nen nguoi la trong mang khong ghi duoc.
   */
  app.get('/api/admin/install', async (req) => {
    if (req.protocol === 'https' && TAILSCALE_HOST.test(req.host)) {
      const url = `https://${req.host.toLowerCase()}`
      if (getSetting('app_url') !== url) setSetting('app_url', url)
    }
    return { appUrl: getSetting('app_url') }
  })

  // ── Bo loc tu dong ───────────────────────────────────────────────────

  app.get('/api/admin/filters', async () => ({
    filters: getDb()
      .prepare<[], FilterRuleRow>('SELECT * FROM filter_rules ORDER BY type, id')
      .all(),
  }))

  app.post<{ Body: { type?: string; value?: string; note?: string } }>(
    '/api/admin/filters',
    async (req, reply) => {
      const type = String(req.body?.type ?? '')
      if (!(FILTER_TYPES as string[]).includes(type)) {
        throw badRequest(`Loại bộ lọc không hợp lệ: ${type}`)
      }
      const value = String(req.body?.value ?? '').trim()
      if (!value) throw badRequest('Chưa nhập giá trị cho bộ lọc')

      if (type === 'title_regex') {
        try {
          new RegExp(value, 'iu')
        } catch (err) {
          throw badRequest(`Biểu thức chính quy sai cú pháp: ${(err as Error).message}`)
        }
      }
      if ((type === 'max_duration' || type === 'min_duration') && !/^\d+$/.test(value)) {
        throw badRequest('Giá trị thời lượng phải là số giây (ví dụ 2400)')
      }

      const db = getDb()
      const info = db
        .prepare('INSERT INTO filter_rules (type, value, note) VALUES (?, ?, ?)')
        .run(type, value, String(req.body?.note ?? '').trim() || null)

      reply.code(201)
      return {
        filter: db
          .prepare<[number], FilterRuleRow>('SELECT * FROM filter_rules WHERE id = ?')
          .get(Number(info.lastInsertRowid)),
      }
    },
  )

  app.patch<{ Params: { id: string }; Body: { isActive?: boolean; value?: string; note?: string } }>(
    '/api/admin/filters/:id',
    async (req) => {
      const id = Number(req.params.id)
      const db = getDb()
      const existing = db
        .prepare<[number], FilterRuleRow>('SELECT * FROM filter_rules WHERE id = ?')
        .get(id)
      if (!existing) throw notFound('Không có bộ lọc này')

      const b = req.body ?? {}
      db.prepare(
        `UPDATE filter_rules SET
           is_active = COALESCE(?, is_active),
           value     = COALESCE(?, value),
           note      = COALESCE(?, note)
         WHERE id = ?`,
      ).run(
        b.isActive === undefined ? null : b.isActive ? 1 : 0,
        b.value === undefined ? null : String(b.value).trim() || null,
        b.note === undefined ? null : String(b.note),
        id,
      )

      return {
        filter: db
          .prepare<[number], FilterRuleRow>('SELECT * FROM filter_rules WHERE id = ?')
          .get(id),
      }
    },
  )

  app.delete<{ Params: { id: string } }>('/api/admin/filters/:id', async (req) => {
    const info = getDb().prepare('DELETE FROM filter_rules WHERE id = ?').run(Number(req.params.id))
    if (info.changes === 0) throw notFound('Không có bộ lọc này')
    return { ok: true }
  })
}
