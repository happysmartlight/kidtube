import { randomBytes } from 'node:crypto'
import { join, resolve } from 'node:path'

function str(key: string, fallback: string): string {
  const v = process.env[key]
  return v === undefined || v === '' ? fallback : v
}

function int(key: string, fallback: number): number {
  const v = process.env[key]
  if (v === undefined || v === '') return fallback
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : fallback
}

const rootDir = resolve(process.cwd())

export const env = {
  nodeEnv: str('NODE_ENV', 'development'),
  get isProd() {
    return this.nodeEnv === 'production'
  },
  port: int('PORT', 8080),
  host: str('HOST', '0.0.0.0'),

  dataDir: resolve(rootDir, str('DATA_DIR', './data')),
  mediaDir: resolve(rootDir, str('MEDIA_DIR', './media')),

  /** Hop thu trao doi voi updater sidecar. Nam trong dataDir de dung chung bind mount. */
  get updateDir(): string {
    return join(this.dataDir, 'update')
  },

  /** Thu muc chua build cua apps/web. Rong = khong serve SPA (che do dev dung Vite). */
  webDist: str('WEB_DIST', ''),

  defaultPin: str('DEFAULT_PIN', '000000'),
  /**
   * Bo trong thi tu sinh -> session admin mat khi restart.
   * Dat bien nay trong production de session ben vung.
   */
  sessionSecret: str('SESSION_SECRET', randomBytes(32).toString('hex')),

  ytApiKey: str('YT_API_KEY', ''),
  ytdlpPath: str('YTDLP_PATH', 'yt-dlp'),
  /**
   * Truyen thang cho `--extractor-args` cua yt-dlp. De trong la dung mac dinh.
   * Day la loi thoat hiem khi YouTube doi ky thuat: sua duoc bang .env, khong
   * phai dung lai image. Vi du khi gap "The page needs to be reloaded":
   *   YTDLP_EXTRACTOR_ARGS=youtube:player_client=default,-tv_downgraded
   */
  ytdlpExtractorArgs: str('YTDLP_EXTRACTOR_ARGS', ''),

  /** Cap chat luong khi tai offline. */
  downloadMaxHeight: int('DOWNLOAD_MAX_HEIGHT', 720),

  appVersion: '0.1.0',
  /**
   * Commit va thoi diem build, do Dockerfile nhet vao (ARG GIT_COMMIT/BUILD_TIME).
   * Rong khi chay o che do dev hoac khi ai do build tay ma khong truyen args —
   * luc do trang Cai dat lay tam tu state cua updater.
   */
  commit: str('KIDTUBE_COMMIT', ''),
  builtAt: str('KIDTUBE_BUILT_AT', ''),
} as const

export type Env = typeof env
