import type { FastifyInstance } from 'fastify'
import { getDb } from '../db/index.js'
import { badRequest } from '../lib/errors.js'
import { isBusy } from '../services/downloader.js'
import {
  hasPendingRequest,
  isOnline,
  readLogTail,
  readState,
  requestAction,
  runningBuild,
} from '../services/updater.js'
import { requireParent } from './auth.js'

/**
 * Cap nhat app tu trang Cai dat.
 *
 * Route o day co tinh chat la ra lenh roi ke chuyen: viec that do container
 * `kidtube-updater` lam. Chinh tien trinh nay se BI GIET giua chung khi
 * container duoc dung lai bang ban moi — nen khong duoc giu trang thai gi
 * trong bo nho, moi thu deu nam trong data/update do updater ghi.
 */

/** Be nao dang xem trong vong 5 phut — cap nhat se cat ngang video cua be. */
function activeKidSessions(): number {
  const row = getDb()
    .prepare<[], { n: number }>(
      `SELECT COUNT(*) AS n FROM kid_sessions
        WHERE closed = 0 AND last_seen_at > datetime('now', '-5 minutes')`,
    )
    .get()
  return row?.n ?? 0
}

function snapshot(): Record<string, unknown> {
  const state = readState()
  const online = isOnline(state)

  return {
    running: runningBuild(),
    updater: {
      // Chua bao gio thay state = sidecar chua duoc bat bao gio.
      installed: state !== null,
      online,
      // Bao cao pha DA GHI, ke ca khi nhip tim tre. Mat nhip khong co nghia
      // la viec da dung — build tren Pi lau, va mang cung co luc nghen.
      phase: state?.phase ?? 'idle',
      pendingRequest: hasPendingRequest(),
      heartbeatAt: state?.heartbeatAt ?? null,
      repoOk: state?.repoOk ?? false,
      repoDir: state?.repoDir ?? null,
      repoError: state?.repoError ?? null,
    },
    repo: state?.repo ?? null,
    deployedCommit: state?.deployedCommit ?? null,
    lastRun: state?.lastRun ?? null,
    log: readLogTail(),
    warnings: {
      activeKidSessions: activeKidSessions(),
      downloadRunning: isBusy(),
    },
  }
}

export async function updateRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireParent)

  app.get('/api/admin/update', async () => snapshot())

  app.post('/api/admin/update/check', async () => {
    const state = readState()
    if (!isOnline(state)) {
      throw badRequest('Chưa bật dịch vụ cập nhật (kidtube-updater). Xem hướng dẫn bên dưới.')
    }
    if (state?.phase === 'updating') {
      throw badRequest('Đang cập nhật — chờ chạy xong đã.')
    }
    requestAction('check')
    return { ok: true }
  })

  app.post('/api/admin/update/run', async () => {
    const state = readState()
    if (!isOnline(state)) {
      throw badRequest('Chưa bật dịch vụ cập nhật (kidtube-updater). Xem hướng dẫn bên dưới.')
    }
    if (state?.phase === 'updating') {
      throw badRequest('Đang cập nhật rồi.')
    }
    if (!state?.repoOk) {
      throw badRequest(state?.repoError ?? 'Dịch vụ cập nhật chưa thấy thư mục cài đặt.')
    }
    if (state.repo?.dirty) {
      throw badRequest(
        'Thư mục cài đặt trên Pi có thay đổi chưa commit. Cập nhật tự động sẽ xoá mất chúng nên đã dừng lại — xử lý bằng tay rồi thử lại.',
      )
    }

    requestAction('update')
    return { ok: true }
  })
}
