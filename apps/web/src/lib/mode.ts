/**
 * Nhan dien che do giao dien: `touch` (tablet) hay `tv` (xem xa, remote D-pad).
 *
 * Khong the dua vao user-agent — Chromium kiosk tren Pi khai bao giong Chrome
 * tren desktop. Dung to hop tin hieu, va luon cho phep bo me ghi de thu cong
 * (cai dat `ui_mode_override`).
 */

export type UiMode = 'touch' | 'tv'
export type ModeSetting = 'auto' | UiMode

const KEY = 'kidtube.mode'

/**
 * Suy luan tu dac diem thiet bi.
 *
 * Tin hieu cho TV:
 *   - khong co con tro chinh xac VA khong co cam ung  -> gan chac la TV
 *   - man hinh rat rong (>= 1600px) va khong cam ung  -> TV hoac man hinh lon
 *
 * Tin hieu cho touch:
 *   - co cam ung -> tablet/dien thoai
 */
export function detectMode(): UiMode {
  if (typeof window === 'undefined') return 'touch'

  const hasTouch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
  const hasFinePointer = window.matchMedia('(pointer: fine)').matches
  const wide = window.innerWidth >= 1600

  if (hasTouch) return 'touch'
  if (!hasFinePointer) return 'tv' // khong chuot, khong cam ung => remote
  if (wide) return 'tv'
  return 'touch'
}

export function resolveMode(setting: ModeSetting): UiMode {
  return setting === 'auto' ? detectMode() : setting
}

export function applyMode(mode: UiMode): void {
  document.documentElement.dataset.mode = mode
}

/** Che do dang ap dung (da chot boi initMode). */
export function currentMode(): UiMode {
  return document.documentElement.dataset.mode === 'tv' ? 'tv' : 'touch'
}

/** Ghi de cuc bo tren THIET BI NAY (uu tien hon cai dat toan he thong). */
export function getLocalOverride(): ModeSetting | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'touch' || v === 'tv' || v === 'auto' ? v : null
  } catch {
    // Cua so an danh / bi chan luu tru — bo qua, dung suy luan tu dong.
    return null
  }
}

export function setLocalOverride(setting: ModeSetting | null): void {
  try {
    if (setting === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, setting)
  } catch {
    /* khong luu duoc thi thoi */
  }
}

/**
 * Chot che do cuoi cung theo do uu tien:
 *   1. ghi de cuc bo tren thiet bi nay
 *   2. cai dat toan he thong tu server
 *   3. suy luan tu dong
 */
export function initMode(serverSetting: ModeSetting): UiMode {
  const local = getLocalOverride()
  const mode = resolveMode(local && local !== 'auto' ? local : serverSetting)
  applyMode(mode)
  return mode
}
