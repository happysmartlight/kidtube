/**
 * Tron mau o TANG JS thay vi dung CSS `color-mix()`.
 *
 * Ly do: `color-mix()` can Chromium 111, nhung trinh duyet cua LG smart TV
 * dung nhan Chromium cu (webOS 24 moi nhat ~ Chromium 108). Nghia la
 * KHONG mot TV LG nao ho tro color-mix — dung no thi mau se bien mat hoan toan
 * (thuoc tinh khong hop le bi bo qua), lam giao dien vo.
 *
 * `rgba()` thi moi trinh duyet deu hieu.
 */

interface Rgb {
  r: number
  g: number
  b: number
}

function parseHex(hex: string): Rgb | null {
  let h = hex.trim().replace('#', '')
  if (h.length === 3) {
    // #abc -> #aabbcc
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (h.length !== 6 || !/^[0-9a-f]{6}$/i.test(h)) return null
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  }
}

/**
 * `#ffd23f` + 0.25 -> `rgba(255, 210, 63, 0.25)`
 *
 * Mau khong parse duoc (vi du bo me nhap ten mau CSS) thi tra ve nguyen ban —
 * mat do trong suot nhung khong vo giao dien.
 */
export function withAlpha(color: string, alpha: number): string {
  const rgb = parseHex(color)
  if (!rgb) return color
  const a = Math.max(0, Math.min(1, alpha))
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`
}

/**
 * Tron `color` len tren `base` voi ti le `ratio` — tuong duong
 * `color-mix(in srgb, color ratio%, base)` nhung ra mau DAC (khong alpha).
 *
 * Dung cho nen cua avatar/chip: can mau dac vi ben duoi co the la anh
 * hoac mau khac, khong muon lo qua.
 */
export function mix(color: string, base: string, ratio: number): string {
  const c = parseHex(color)
  const b = parseHex(base)
  if (!c || !b) return color
  const t = Math.max(0, Math.min(1, ratio))
  const r = Math.round(c.r * t + b.r * (1 - t))
  const g = Math.round(c.g * t + b.g * (1 - t))
  const bl = Math.round(c.b * t + b.b * (1 - t))
  return `rgb(${r}, ${g}, ${bl})`
}

/** Mau nen card, khop voi --card-hi trong index.css. */
export const CARD_HI = '#2f2942'
export const CARD = '#241f33'

/**
 * Bang mau dang HEX.
 *
 * Phai la hex (khong phai `var(--x)`) vi `withAlpha()`/`mix()` can doc duoc
 * gia tri that de tinh rgba — JS khong doc duoc gia tri cua CSS custom property
 * ma khong goi getComputedStyle. Giu dong bo voi :root trong index.css.
 */
export const C = {
  focus: '#ffd23f',
  danger: '#ff6b8a',
  ok: '#4ecb71',
  warn: '#ff9f43',
  dim: '#a79cc4',
  text: '#f6f3ff',
} as const
