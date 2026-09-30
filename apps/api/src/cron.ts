import type { FastifyBaseLogger } from 'fastify'
import { getDb, getSettingInt } from './db/index.js'
import {
  cleanupOrphanFiles,
  enforceStorageLimit,
  enqueueFavorites,
  tick,
} from './services/downloader.js'
import { ingestAllAutoSources } from './services/ingest.js'

/**
 * Lich nen. Dung setInterval don gian thay vi thu vien cron:
 * moi viec o day chay theo CHU KY, khong can chay vao gio cu the.
 * Bot mot dependency la bot mot thu phai bao tri tren Pi.
 */

const TICK_MS = 30_000 // worker tai
const HOUSEKEEPING_MS = 60 * 60_000 // don dep: 1 gio

let timers: NodeJS.Timeout[] = []
let pullInFlight = false
let lastPullAt = 0

export function startCron(log: FastifyBaseLogger): void {
  stopCron()

  // ── Worker tai offline ──────────────────────────────────────────────
  timers.push(
    setInterval(() => {
      void tick().catch((err) => log.warn({ err }, 'Lỗi khi chạy worker tải'))
    }, TICK_MS),
  )

  // ── Keo video moi ───────────────────────────────────────────────────
  // Kiem tra moi 5 phut nhung chi keo khi da du `pull_interval_hours`,
  // de bo me doi cai dat la co hieu luc ngay, khong phai restart server.
  timers.push(
    setInterval(
      () => {
        void runPull(log)
      },
      5 * 60_000,
    ),
  )

  // ── Don dep ─────────────────────────────────────────────────────────
  timers.push(
    setInterval(() => {
      void housekeeping(log)
    }, HOUSEKEEPING_MS),
  )

  log.info('Cron đã khởi động (worker 30s, kiểm tra nguồn 5 phút, dọn dẹp 1 giờ)')

  // Chay don dep mot lan ngay khi khoi dong.
  void housekeeping(log)
}

export function stopCron(): void {
  for (const t of timers) clearInterval(t)
  timers = []
}

async function runPull(log: FastifyBaseLogger): Promise<void> {
  if (pullInFlight) return

  const intervalMs = Math.max(1, getSettingInt('pull_interval_hours', 6)) * 3_600_000
  if (Date.now() - lastPullAt < intervalMs) return

  pullInFlight = true
  try {
    const results = await ingestAllAutoSources()
    lastPullAt = Date.now()

    const added = results.reduce((s, r) => s + r.added, 0)
    const rejected = results.reduce((s, r) => s + r.autoRejected, 0)
    if (added > 0 || rejected > 0) {
      log.info(
        { sources: results.length, added, autoRejected: rejected },
        'Đã kéo video mới về hàng chờ duyệt',
      )
    }

    const failed = results.filter((r) => r.warnings.some((w) => w.startsWith('Lỗi:')))
    for (const f of failed) {
      log.warn({ sourceId: f.sourceId, warnings: f.warnings }, 'Nguồn kéo về bị lỗi')
    }

    // Video moi duoc duyet co the can tai ve.
    enqueueFavorites()
  } catch (err) {
    log.error({ err }, 'Lỗi khi kéo video mới')
  } finally {
    pullInFlight = false
  }
}

async function housekeeping(log: FastifyBaseLogger): Promise<void> {
  try {
    const db = getDb()

    // Dong phien bo ngo qua 24 gio — neu khong, gioi han "so video/luot"
    // se dinh mai o mot phien khong bao gio ket thuc.
    const closed = db
      .prepare(
        "UPDATE kid_sessions SET closed = 1 WHERE closed = 0 AND last_seen_at < datetime('now', '-1 day')",
      )
      .run()

    // Watch log mo qua lau (tab bi tat dot ngot) — dong lai de bao cao dung.
    db.prepare(
      "UPDATE watch_log SET ended_at = datetime('now') WHERE ended_at IS NULL AND started_at < datetime('now', '-1 day')",
    ).run()

    const orphans = await cleanupOrphanFiles()
    const evicted = await enforceStorageLimit()

    // Con vua danh dau ❤️ thi khong nen doi het chu ky keo nguon (mac dinh 6
    // gio) moi xep hang tai. Chi chay khi bo me bat cai dat tu dong.
    const favorites = enqueueFavorites().enqueued

    if (closed.changes > 0 || orphans > 0 || evicted > 0 || favorites > 0) {
      log.info(
        {
          sessionsClosed: closed.changes,
          orphanFilesRemoved: orphans,
          evictedForSpace: evicted,
          favoritesQueued: favorites,
        },
        'Dọn dẹp xong',
      )
    }
  } catch (err) {
    log.error({ err }, 'Lỗi khi dọn dẹp')
  }
}
