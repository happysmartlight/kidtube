import { useCallback, useEffect, useState } from 'react'

/**
 * Router toi gian dua tren History API.
 *
 * Khong dung react-router: app nay chi co ~7 route va khong can nested layout,
 * route loader hay data API. Bot mot dependency la bot mot thu phai theo doi
 * phien ban khi bao tri tren Pi.
 *
 * Backend da co SPA fallback (moi duong dan khong phai /api tra ve index.html),
 * nen duong dan that hoat dong binh thuong khi reload.
 */

type Listener = (path: string) => void
const listeners = new Set<Listener>()

function emit(): void {
  const path = window.location.pathname
  for (const fn of listeners) fn(path)
}

/**
 * Moi muc lich su nho duong dan cua muc NGAY TRUOC no. Nho vay "quay lai"
 * biet duoc lui lich su (history.back) co dua ve dung trang can ve khong.
 */
interface NavState {
  prev?: string
}

function currentState(): NavState {
  const s: unknown = window.history.state
  return s !== null && typeof s === 'object' ? (s as NavState) : {}
}

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  if (path === window.location.pathname) return
  if (opts.replace) {
    // Thay tai cho: muc truoc van la muc truoc — giu nguyen `prev`.
    window.history.replaceState(currentState(), '', path)
  } else {
    const state: NavState = { prev: window.location.pathname }
    window.history.pushState(state, '', path)
  }
  emit()
}

/** Luoi video cua be — noi nut Back tu trang xem video / trang bo me ve toi. */
export function isKidListing(path: string): boolean {
  return path === '/home' || path === '/channels' || path === '/'
}

/**
 * Quay lai `fallback` theo cach giu lich su SACH.
 *
 * Neu muc truoc la trang ma `accept` chap nhan -> lui lich su that
 * (history.back). Khong thi THAY muc hien tai bang `fallback`.
 *
 * Truoc day "ve trang chu" la pushState('/home'): lich su thanh
 * /home -> /watch/5 -> /home, va nut Back cua remote TV (= back cua trinh
 * duyet) lai mo lai video vua xem. Lui that thi khong bao gio co chuyen do.
 */
export function backOr(fallback: string, accept: (prev: string) => boolean = (p) => p === fallback): void {
  const prev = currentState().prev
  if (prev !== undefined && accept(prev)) window.history.back()
  else navigate(fallback, { replace: true })
}

export function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname)

  useEffect(() => {
    const onPop = (): void => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    listeners.add(setPath)
    return () => {
      window.removeEventListener('popstate', onPop)
      listeners.delete(setPath)
    }
  }, [])

  return path
}

export function useNavigate(): (path: string, opts?: { replace?: boolean }) => void {
  return useCallback((path: string, opts?: { replace?: boolean }) => navigate(path, opts), [])
}

/**
 * So khop duong dan voi mau co tham so kieu `/watch/:id`.
 * Tra ve cac tham so, hoac null neu khong khop.
 */
export function matchPath(
  pattern: string,
  path: string,
): Record<string, string> | null {
  const pSeg = pattern.split('/').filter(Boolean)
  const aSeg = path.split('/').filter(Boolean)
  if (pSeg.length !== aSeg.length) return null

  const params: Record<string, string> = {}
  for (let i = 0; i < pSeg.length; i++) {
    const p = pSeg[i]!
    const a = aSeg[i]!
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(a)
    } else if (p !== a) {
      return null
    }
  }
  return params
}
