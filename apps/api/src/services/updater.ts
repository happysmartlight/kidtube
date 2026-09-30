import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { env } from '../env.js'

/**
 * Cau noi toi updater sidecar.
 *
 * Container nay khong the tu build lai chinh no, nen viec cap nhat do
 * container `kidtube-updater` lam ho. Hai ben noi chuyen qua FILE trong
 * thu muc data/update — khong phai HTTP:
 *
 *   request.json  ta ghi  -> updater doc roi xoa
 *   state.json    updater ghi -> ta doc (co nhip tim)
 *   last-run.log  updater ghi -> ta doc phan duoi
 *
 * Chon file vi trong luc cap nhat, chinh tien trinh nay bi giet va thay
 * bang ban moi. File thi song sot qua viec do; ket noi mang thi khong.
 */

const REQUEST = 'request.json'
const STATE = 'state.json'
const LOG = 'last-run.log'

/** Qua moc nay ma khong co nhip tim moi thi coi nhu updater da chet. */
const HEARTBEAT_STALE_MS = 30_000

/** Chi doc phan duoi cua log — build tren Pi de ra vai tram dong. */
const LOG_TAIL_BYTES = 16_384

export type UpdatePhase = 'idle' | 'checking' | 'updating'

export interface RepoInfo {
  branch: string
  upstream: string | null
  head: string
  headShort: string
  headSubject: string
  headDate: string
  dirty: boolean
  behind: number
  pending: Array<{ short: string; subject: string }>
  checkedAt: string
  fetchError: string | null
}

export interface LastRun {
  action: string
  startedAt: string
  finishedAt: string
  ok: boolean
  step: string
  error: string | null
  fromCommit: string | null
  toCommit: string | null
}

export interface UpdaterState {
  heartbeatAt: string
  phase: UpdatePhase
  repoOk: boolean
  repoDir: string
  repoError: string | null
  repo: RepoInfo | null
  deployedCommit: string | null
  lastRun: LastRun | null
}

function path(name: string): string {
  return join(env.updateDir, name)
}

/**
 * Tao san thu muc trao doi. Ta chay bang PUID nen thu muc se thuoc ve ta;
 * updater chay bang root nen van ghi de duoc. Nguoc lai thi khong — do la
 * ly do ben tao phai la ben nay.
 */
export function ensureUpdateDir(): void {
  try {
    mkdirSync(env.updateDir, { recursive: true })
  } catch {
    /* khong tao duoc thi cac ham duoi tu bao "chua cai updater" */
  }
}

export function readState(): UpdaterState | null {
  try {
    const raw = readFileSync(path(STATE), 'utf8')
    return JSON.parse(raw) as UpdaterState
  } catch {
    return null
  }
}

/** Updater con song hay khong — dua vao nhip tim, khong dua vao su ton tai cua file. */
export function isOnline(state: UpdaterState | null): boolean {
  if (!state?.heartbeatAt) return false
  const beat = Date.parse(state.heartbeatAt)
  if (!Number.isFinite(beat)) return false
  return Date.now() - beat < HEARTBEAT_STALE_MS
}

export function readLogTail(): string | null {
  try {
    const file = path(LOG)
    const size = statSync(file).size
    const start = Math.max(0, size - LOG_TAIL_BYTES)
    const buf = readFileSync(file)
    return buf.subarray(start).toString('utf8')
  } catch {
    return null
  }
}

/**
 * Dat mot yeu cau vao hop thu. Ghi ra file tam roi `rename` — de updater
 * khong doc phai mot file JSON viet do dang.
 */
export function requestAction(action: 'check' | 'update'): string {
  ensureUpdateDir()
  const id = randomBytes(8).toString('hex')
  const body = JSON.stringify({ action, id, requestedAt: new Date().toISOString() })
  const tmp = path(`${REQUEST}.tmp`)
  writeFileSync(tmp, body, 'utf8')
  renameSync(tmp, path(REQUEST))
  return id
}

/** Con yeu cau nao chua duoc updater nhat len khong. */
export function hasPendingRequest(): boolean {
  return existsSync(path(REQUEST))
}

/** Thong tin ve chinh ban dang chay — do Dockerfile nhet vao luc build. */
export function runningBuild(): {
  version: string
  commit: string | null
  commitShort: string | null
  builtAt: string | null
} {
  const commit = env.commit || null
  return {
    version: env.appVersion,
    commit,
    commitShort: commit ? commit.slice(0, 7) : null,
    builtAt: env.builtAt || null,
  }
}
