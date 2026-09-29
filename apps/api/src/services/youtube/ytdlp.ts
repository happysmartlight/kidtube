import { spawn } from 'node:child_process'
import { env } from '../../env.js'
import type { IngestedVideo } from '../../db/types.js'
import { thumbUrl } from './resolve.js'

/**
 * Wrapper yt-dlp.
 *
 * yt-dlp la TUY CHON: may dev (Windows) thuong khong co, Docker image tren Pi thi co.
 * Moi ham o day tra ve null / mang rong khi khong co binary, de phan con lai
 * cua ung dung van chay binh thuong voi RSS.
 */

let available: boolean | null = null

export async function ytdlpAvailable(): Promise<boolean> {
  if (available !== null) return available
  try {
    const { code } = await run(['--version'], { timeoutMs: 10_000 })
    available = code === 0
  } catch {
    available = false
  }
  return available
}

export function resetYtdlpProbe(): void {
  available = null
}

export async function ytdlpVersion(): Promise<string | null> {
  try {
    const { stdout, code } = await run(['--version'], { timeoutMs: 10_000 })
    return code === 0 ? stdout.trim() : null
  } catch {
    return null
  }
}

interface RunResult {
  code: number | null
  stdout: string
  stderr: string
}

interface RunOptions {
  timeoutMs?: number
  /** Goi cho moi dong stdout — dung de doc tien do tai. */
  onLine?: (line: string) => void
}

function run(args: string[], opts: RunOptions = {}): Promise<RunResult> {
  const { timeoutMs = 120_000, onLine } = opts
  return new Promise((resolvePromise, reject) => {
    const child = spawn(env.ytdlpPath, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    let buffer = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(new Error(`yt-dlp quá thời gian chờ (${timeoutMs}ms)`))
    }, timeoutMs)

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
      if (!onLine) return
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) onLine(line)
    })

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })

    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (buffer && onLine) onLine(buffer)
      resolvePromise({ code, stdout, stderr })
    })
  })
}

/** Truong can lay tu yt-dlp, dang --print de khong phai parse ca JSON lon. */
const PRINT_FMT = [
  '%(id)s',
  '%(title)s',
  '%(duration)s',
  '%(channel_id)s',
  '%(channel)s',
  '%(upload_date)s',
  '%(is_live)s',
  '%(thumbnail)s',
].join('\t')

function parsePrintLine(line: string): IngestedVideo | null {
  const f = line.split('\t')
  const id = f[0]?.trim()
  if (!id || id === 'NA') return null

  const durRaw = f[2]?.trim()
  const dur = durRaw && durRaw !== 'NA' ? Math.round(Number(durRaw)) : NaN

  const uploadDate = f[5]?.trim() // YYYYMMDD
  const publishedAt =
    uploadDate && /^\d{8}$/.test(uploadDate)
      ? `${uploadDate.slice(0, 4)}-${uploadDate.slice(4, 6)}-${uploadDate.slice(6, 8)}T00:00:00Z`
      : null

  const thumb = f[7]?.trim()
  const chId = f[3]?.trim()
  const chTitle = f[4]?.trim()

  return {
    youtubeId: id,
    title: f[1]?.trim() || id,
    thumbnail: thumb && thumb !== 'NA' ? thumb : thumbUrl(id),
    durationSec: Number.isFinite(dur) && dur > 0 ? dur : null,
    channelId: chId && chId !== 'NA' ? chId : null,
    channelTitle: chTitle && chTitle !== 'NA' ? chTitle : null,
    publishedAt,
    isLive: f[6]?.trim() === 'True',
  }
}

/**
 * Lay metadata cho mot danh sach videoId cu the (dung de bu duration cho RSS).
 * Goi theo lo de tranh spawn qua nhieu process.
 */
export async function fetchVideoMeta(videoIds: string[]): Promise<IngestedVideo[]> {
  if (videoIds.length === 0 || !(await ytdlpAvailable())) return []

  const urls = videoIds.map((id) => `https://www.youtube.com/watch?v=${id}`)
  const { stdout } = await run(
    ['--no-warnings', '--ignore-errors', '--no-playlist', '--skip-download', '--print', PRINT_FMT, ...urls],
    { timeoutMs: Math.min(30_000 + videoIds.length * 8_000, 600_000) },
  )

  const out: IngestedVideo[] = []
  for (const line of stdout.split('\n')) {
    const v = parsePrintLine(line)
    if (v) out.push(v)
  }
  return out
}

/**
 * Liet ke video cua mot kenh/playlist. Khac RSS: lay duoc TOAN BO lich su,
 * khong chi 15 video moi nhat.
 *
 * Dung --flat-playlist nen KHONG co duration dang tin cay cho moi truong hop;
 * duration duoc bu sau boi fetchVideoMeta khi can.
 */
export async function listPlaylist(
  url: string,
  limit = 100,
): Promise<IngestedVideo[]> {
  if (!(await ytdlpAvailable())) return []

  const { stdout } = await run(
    [
      '--no-warnings',
      '--ignore-errors',
      '--flat-playlist',
      '--playlist-end',
      String(limit),
      '--print',
      PRINT_FMT,
      url,
    ],
    { timeoutMs: Math.min(60_000 + limit * 1_000, 600_000) },
  )

  const out: IngestedVideo[] = []
  for (const line of stdout.split('\n')) {
    const v = parsePrintLine(line)
    if (v) out.push(v)
  }
  return out
}

export interface DownloadOptions {
  /** Duong dan file dich (khong co duoi; yt-dlp tu them .mp4). */
  outputTemplate: string
  maxHeight?: number
  onProgress?: (percent: number) => void
  timeoutMs?: number
}

export interface DownloadResult {
  ok: boolean
  error?: string
}

/** Bat dong tien do dang: [download]  45.2% of ... */
const PROGRESS_RE = /\[download\]\s+(\d+(?:\.\d+)?)%/

export async function downloadVideo(
  videoId: string,
  opts: DownloadOptions,
): Promise<DownloadResult> {
  if (!(await ytdlpAvailable())) {
    return { ok: false, error: 'yt-dlp không có trên hệ thống' }
  }

  const maxH = opts.maxHeight ?? env.downloadMaxHeight
  // Uu tien video+audio roi merge; neu khong co thi lay ban gop san.
  const format = `bv*[height<=${maxH}]+ba/b[height<=${maxH}]/b`

  try {
    const { code, stderr } = await run(
      [
        '--no-warnings',
        '--newline', // bat buoc: de parse tien do theo dong
        '--no-playlist',
        '--no-part',
        '--retries',
        '3',
        '--format',
        format,
        '--merge-output-format',
        'mp4',
        '--output',
        opts.outputTemplate,
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      {
        timeoutMs: opts.timeoutMs ?? 1_800_000, // 30 phut cho video dai
        onLine: (line) => {
          const m = PROGRESS_RE.exec(line)
          if (m?.[1]) opts.onProgress?.(Number(m[1]))
        },
      },
    )

    if (code !== 0) {
      const tail = stderr.trim().split('\n').slice(-3).join(' | ')
      return { ok: false, error: tail || `yt-dlp thoát với mã ${code}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
