import cookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance } from 'fastify'
import { existsSync } from 'node:fs'
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startCron, stopCron } from './cron.js'
import { closeDb, openDb } from './db/index.js'
import { seedIfNeeded } from './db/seed.js'
import { env } from './env.js'
import { HttpError } from './lib/errors.js'
import { recoverStuckJobs } from './services/downloader.js'
import { initTls, onTlsRenewed, setHttpsActive, stopTls } from './services/tls.js'
import { ensureUpdateDir } from './services/updater.js'
import { ytdlpAvailable, ytdlpVersion } from './services/youtube/ytdlp.js'
import { hasApiKey } from './services/youtube/dataapi.js'
import { authRoutes } from './routes/auth.js'
import { downloadRoutes } from './routes/downloads.js'
import { installRoutes } from './routes/install.js'
import { kidRoutes } from './routes/kid.js'
import { profileRoutes } from './routes/profiles.js'
import { settingsRoutes } from './routes/settings.js'
import { shelfRoutes } from './routes/shelves.js'
import { sourceRoutes } from './routes/sources.js'
import { statsRoutes } from './routes/stats.js'
import { updateRoutes } from './routes/update.js'
import { videoRoutes } from './routes/videos.js'

const here = dirname(fileURLToPath(import.meta.url))

function findWebDist(): string | null {
  if (env.webDist) return existsSync(env.webDist) ? env.webDist : null
  const candidates = [
    resolve(here, '../../web/dist'), // chay tu dist/ sau khi build
    resolve(here, '../../../web/dist'),
    resolve(process.cwd(), 'apps/web/dist'),
    resolve(process.cwd(), '../web/dist'),
  ]
  return candidates.find((p) => existsSync(p)) ?? null
}

/**
 * Cong HTTPS chay SONG SONG voi HTTP, cung mot app Fastify — xem
 * services/tls.ts vi sao can. HTTP giu nguyen: TV LG khong cai duoc chung chi,
 * va tablet can HTTP de tai CA o lan cai dau tien.
 *
 * Loi o day (trung cong, khong ghi duoc data/tls...) chi canh bao: app van
 * chay HTTP binh thuong, chi la chua cai PWA duoc.
 */
async function startHttps(app: FastifyInstance): Promise<HttpsServer | null> {
  if (env.httpsPort <= 0) {
    app.log.info('HTTPS đang tắt (HTTPS_PORT=0) — không cài được app lên điện thoại/tablet.')
    return null
  }
  const tls = initTls(app.log)
  if (!tls) return null

  const server = createHttpsServer({ key: tls.key, cert: tls.cert }, (req, res) => app.routing(req, res))
  // Hoc them dia chi / gia han -> thay chung chi ngay, khong can khoi dong lai.
  onTlsRenewed((m) => server.setSecureContext({ key: m.key, cert: m.cert }))

  const ok = await new Promise<boolean>((done) => {
    server.once('error', (err) => {
      app.log.warn({ err }, `Không mở được cổng HTTPS ${env.httpsPort} — chỉ chạy HTTP`)
      done(false)
    })
    server.listen(env.httpsPort, env.host, () => done(true))
  })
  if (!ok) return null

  server.on('error', (err) => app.log.error({ err }, 'Lỗi server HTTPS'))
  setHttpsActive(true)
  app.log.info(`HTTPS lắng nghe ở cổng ${env.httpsPort} (thiết bị mở cổng ${env.httpsPublicPort})`)
  return server
}

async function main(): Promise<void> {
  const app = Fastify({
    logger: {
      level: env.isProd ? 'info' : 'debug',
      transport: env.isProd
        ? undefined
        : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
    },
    // Tre bam nhanh va nhieu; body luon nho.
    bodyLimit: 1024 * 256,
    trustProxy: true, // Caddy dung o truoc
  })

  openDb()
  ensureUpdateDir()
  const seed = seedIfNeeded()
  if (seed.seeded) {
    app.log.warn(
      `Lần đầu khởi động — PIN quản trị mặc định là "${seed.pin}". Đổi trong Cài đặt của bố mẹ.`,
    )
  } else if (seed.pinReset) {
    app.log.warn(
      `Không tìm thấy PIN trong cơ sở dữ liệu — đặt lại về mặc định "${seed.pin}". Đổi trong Cài đặt của bố mẹ.`,
    )
  }

  const recovered = recoverStuckJobs()
  if (recovered > 0) app.log.info(`Đã đưa ${recovered} job tải bị kẹt về hàng đợi`)

  await app.register(cookie, { secret: env.sessionSecret })

  /**
   * Nhieu endpoint POST khong can body (logout, cleanup, tick, end-session...).
   * Parser JSON mac dinh cua Fastify tra 400 khi co header content-type: application/json
   * nhung body rong — va client thi rat de gui nhu vay. Coi body rong la {}.
   *
   * Phat hien trong smoke test: logout that bai kieu nay khien phien KHONG duoc xoa,
   * nen admin van vao duoc sau khi bam dang xuat.
   */
  app.addContentTypeParser<string>(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      const text = typeof body === 'string' ? body.trim() : ''
      if (text === '') {
        done(null, {})
        return
      }
      try {
        done(null, JSON.parse(text))
      } catch {
        const err = Object.assign(new Error('Body không phải JSON hợp lệ'), { statusCode: 400 })
        done(err, undefined)
      }
    },
  )

  // ── Xu ly loi tap trung ─────────────────────────────────────────────
  app.setErrorHandler((error: unknown, req, reply) => {
    if (error instanceof HttpError) {
      reply.code(error.statusCode)
      return reply.send({ error: error.message, code: error.code })
    }

    const err = error as { statusCode?: unknown; message?: unknown }
    // Loi validate cua Fastify (co san statusCode 4xx)
    if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
      reply.code(err.statusCode)
      return reply.send({ error: String(err.message ?? 'Yêu cầu không hợp lệ') })
    }
    req.log.error({ err: error }, "Lỗi không lường trước")
    reply.code(500)
    return reply.send({ error: 'Lỗi hệ thống. Xem log của server để biết chi tiết.' })
  })

  // ── API ─────────────────────────────────────────────────────────────
  await app.register(authRoutes)
  await app.register(kidRoutes)
  await app.register(sourceRoutes)
  await app.register(videoRoutes)
  await app.register(shelfRoutes)
  await app.register(profileRoutes)
  await app.register(settingsRoutes)
  await app.register(downloadRoutes)
  await app.register(statsRoutes)
  await app.register(updateRoutes)
  await app.register(installRoutes)

  app.get('/api/health', async () => ({
    ok: true,
    version: env.appVersion,
    ytdlp: await ytdlpVersion(),
    ytdlpAvailable: await ytdlpAvailable(),
    hasApiKey: hasApiKey(),
    uptimeSec: Math.round(process.uptime()),
  }))

  // ── Video da tai ve ─────────────────────────────────────────────────
  await app.register(fastifyStatic, {
    root: env.mediaDir,
    prefix: '/media/',
    decorateReply: false,
    index: false,
    // Khong liet ke thu muc: tre khong can, va do chinh la be mat tan cong
    // cua lo hong path traversal trong @fastify/static cu.
    list: false,
    // Video local duoc phep cache lau — ten file la youtube_id nen bat bien.
    cacheControl: true,
    maxAge: '7d',
    acceptRanges: true, // bat buoc de tua video hoat dong
  })

  // ── SPA ─────────────────────────────────────────────────────────────
  const webDist = findWebDist()
  if (webDist) {
    app.log.info(`Đang serve giao diện từ ${webDist}`)
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: '/',
      decorateReply: true,
      index: ['index.html'],
      list: false,
      // Vite gan hash vao ten file trong assets/ -> noi dung khong bao gio doi,
      // cache vinh vien. TV (khong co service worker) do phai hoi lai moi lan.
      // index.html, sw.js, manifest van max-age=0 de ban moi den ngay.
      setHeaders: (reply, path) => {
        if (path.includes(`${sep}assets${sep}`)) {
          reply.header('cache-control', 'public, max-age=31536000, immutable')
        }
      },
    })

    // Fallback cho client-side routing: moi duong dan khong phai API tra ve index.html
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/media/')) {
        reply.code(404)
        return reply.send({ error: 'Không có endpoint này' })
      }
      return reply.sendFile('index.html')
    })
  } else {
    app.log.warn(
      'Không tìm thấy apps/web/dist — chỉ chạy API. Ở chế độ dev, mở giao diện qua Vite (cổng 5173).',
    )
  }

  startCron(app.log)

  let https: HttpsServer | null = null

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Nhận ${signal}, đang tắt...`)
    stopCron()
    stopTls()
    if (https) {
      https.close()
      https.closeAllConnections()
    }
    await app.close()
    closeDb()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  await app.listen({ port: env.port, host: env.host })
  https = await startHttps(app)
}

main().catch((err) => {
  console.error('Không khởi động được server:', err)
  process.exit(1)
})
