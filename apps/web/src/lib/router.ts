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

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  if (path === window.location.pathname) return
  if (opts.replace) window.history.replaceState(null, '', path)
  else window.history.pushState(null, '', path)
  emit()
}

export function back(): void {
  window.history.back()
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
