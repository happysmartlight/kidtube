import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'

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

  /** Thu muc chua build cua apps/web. Rong = khong serve SPA (che do dev dung Vite). */
  webDist: str('WEB_DIST', ''),

  defaultPin: str('DEFAULT_PIN', '246813'),
  /**
   * Bo trong thi tu sinh -> session admin mat khi restart.
   * Dat bien nay trong production de session ben vung.
   */
  sessionSecret: str('SESSION_SECRET', randomBytes(32).toString('hex')),

  ytApiKey: str('YT_API_KEY', ''),
  ytdlpPath: str('YTDLP_PATH', 'yt-dlp'),

  /** Cap chat luong khi tai offline. */
  downloadMaxHeight: int('DOWNLOAD_MAX_HEIGHT', 720),
} as const

export type Env = typeof env
