import { upstream } from './errors.js'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'

export interface FetchTextOptions {
  timeoutMs?: number
  headers?: Record<string, string>
  /** Tra null thay vi nem loi khi gap HTTP 4xx (huu ich cho probe). */
  tolerate404?: boolean
}

/**
 * GET mot URL va tra ve text. Luon co timeout — khong bao gio de request
 * treo vo han, vi cron goi ham nay va mot request treo se chan ca lich nen.
 */
export async function fetchText(
  url: string,
  opts: FetchTextOptions = {},
): Promise<string | null> {
  const { timeoutMs = 15_000, headers = {}, tolerate404 = false } = opts
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, 'accept-language': 'vi,en;q=0.8', ...headers },
    })
    if (!res.ok) {
      if (tolerate404 && res.status >= 400 && res.status < 500) return null
      throw upstream(`HTTP ${res.status} khi goi ${url}`)
    }
    return await res.text()
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw upstream(`Qua thoi gian cho (${timeoutMs}ms) khi goi ${url}`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchJson<T>(url: string, opts: FetchTextOptions = {}): Promise<T | null> {
  const text = await fetchText(url, opts)
  if (text === null) return null
  try {
    return JSON.parse(text) as T
  } catch {
    throw upstream(`Phan hoi khong phai JSON hop le tu ${url}`)
  }
}
