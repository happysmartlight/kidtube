import { useEffect } from 'react'
import { currentMode } from '@/lib/mode'
import { sfx } from '@/lib/sfx'
import { safeScrollIntoView } from '@/lib/tv'

/**
 * SPATIAL NAVIGATION cho remote D-pad (TV).
 *
 * Tu viet thay vi dung thu vien vi can kiem soat chinh xac cach tim lang gieng:
 * theo HINH HOC tren man hinh, khong theo thu tu DOM. Mot card nam ben phai
 * phai duoc chon khi bam ->, du no dung o dau trong cay DOM.
 *
 * Thuat toan: tu rect cua element dang focus, loc cac ung vien nam ve phia
 * can di, tinh diem = khoang_cach_doc_truc + 2 x lech_vuong_goc, chon nho nhat.
 * He so 2 o lech vuong goc lam cho di THANG duoc uu tien hon di CHEO —
 * khong co no, bam -> co the nhay xuong card o hang duoi.
 */

type Dir = 'up' | 'down' | 'left' | 'right'

const SELECTOR = '[data-focusable]:not([disabled]):not([aria-hidden="true"])'

function candidates(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(SELECTOR)).filter((el) => {
    // Bo qua element bi an hoac co kich thuoc 0 (vi du trong tab dang dong)
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return false
    return el.offsetParent !== null || getComputedStyle(el).position === 'fixed'
  })
}

interface Point {
  x: number
  y: number
}

function center(el: HTMLElement): Point {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

/**
 * Element co nam ve phia `dir` so voi `from` khong.
 * Dung nguong 4px de tranh nhieu do lam tron sub-pixel.
 */
function inDirection(from: Point, to: Point, dir: Dir): boolean {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const T = 4
  switch (dir) {
    case 'left':
      return dx < -T
    case 'right':
      return dx > T
    case 'up':
      return dy < -T
    case 'down':
      return dy > T
  }
}

function score(from: Point, to: Point, dir: Dir): number {
  const dx = Math.abs(to.x - from.x)
  const dy = Math.abs(to.y - from.y)
  const horizontal = dir === 'left' || dir === 'right'
  const along = horizontal ? dx : dy
  const across = horizontal ? dy : dx
  return along + across * 2
}

export function findNext(current: HTMLElement | null, dir: Dir): HTMLElement | null {
  const all = candidates()
  if (all.length === 0) return null
  if (!current) return all[0] ?? null

  const from = center(current)
  let best: HTMLElement | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const el of all) {
    if (el === current) continue
    const to = center(el)
    if (!inDirection(from, to, dir)) continue
    const s = score(from, to, dir)
    if (s < bestScore) {
      bestScore = s
      best = el
    }
  }
  return best
}

export function focusElement(el: HTMLElement): void {
  try {
    el.focus({ preventScroll: true })
  } catch {
    // Ban cu khong nhan doi tuong tuy chon cho focus().
    el.focus()
  }
  // `inline: center` giu card dang chon o giua khi cuon ngang — quan trong tren TV,
  // neu khong thi card se dinh sat canh man hinh.
  safeScrollIntoView(el)
}

/** Dua focus vao element dau tien co y nghia (khi vao trang moi). */
export function focusFirst(container?: HTMLElement | null): boolean {
  const root = container ?? document
  const el = root.querySelector<HTMLElement>(SELECTOR)
  if (!el) return false
  focusElement(el)
  return true
}

export interface SpatialOptions {
  /**
   * Chan xu ly mac dinh. Trang xem video dung cai nay: o day mui tien
   * ngang la TUA video, khong phai di chuyen focus.
   */
  intercept?: (key: string, event: KeyboardEvent) => boolean
  /** Goi khi bam Escape/Backspace. */
  onBack?: () => void
}

/**
 * Gan xu ly ban phim toan cuc. Dat MOT lan o cap cao (App), khong dat nhieu noi.
 */
export function useSpatialNavigation(opts: SpatialOptions = {}): void {
  const { intercept, onBack } = opts

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      // Khong cuop phim khi bo me dang go trong o nhap lieu.
      const t = e.target as HTMLElement | null
      const tag = t?.tagName
      const typing =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable === true

      if (intercept?.(e.key, e)) return

      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight': {
          if (typing) return
          const dir = e.key.replace('Arrow', '').toLowerCase() as Dir
          const active = document.activeElement
          const current =
            active instanceof HTMLElement && active.matches(SELECTOR) ? active : null
          const next = findNext(current, dir)
          if (next) {
            e.preventDefault()
            focusElement(next)
            sfx.tick()
          }
          break
        }

        case 'Enter': {
          // Remote TV goi Enter; de trinh duyet tu bam <button>.
          break
        }

        case 'Escape':
        case 'Backspace': {
          // Backspace trong o nhap lieu = xoa ky tu, khong phai quay lai.
          if (typing && e.key === 'Backspace') return
          if (onBack) {
            e.preventDefault()
            sfx.back()
            onBack()
          }
          break
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [intercept, onBack])
}

/**
 * Dua focus vao trang sau khi render xong.
 * `deps` doi thi focus duoc dat lai — dung khi doi trang hoac du lieu vua ve.
 *
 * CHI chay o che do TV. Remote can mot diem xuat phat nhin thay duoc; cam
 * ung thi khong — tre cham thang vao thu minh muon. Chay ca o che do cam ung
 * thi sinh loi: mo app khi da nho be = chua co lan cham nao, trinh duyet coi
 * focus bang script la focus "ban phim" (:focus-visible), nen nut ke dau tien
 * phong to + hien vong sang ngay khi vao trang, nhin nhu bi loi.
 *
 * Ban phim o che do cam ung van dung duoc: bam mui ten khi chua co gi dang
 * focus thi findNext tra ve phan tu dau tien.
 */
export function useAutoFocus(enabled: boolean, deps: unknown[] = []): void {
  useEffect(() => {
    if (!enabled || currentMode() !== 'tv') return
    // Doi mot frame de DOM ve xong truoc khi tim element.
    const id = requestAnimationFrame(() => {
      const active = document.activeElement
      // Khong cuop focus neu nguoi dung da tu chon cai gi.
      if (active instanceof HTMLElement && active.matches(SELECTOR)) return
      focusFirst()
    })
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps])
}
