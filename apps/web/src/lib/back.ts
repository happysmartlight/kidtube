import { useEffect, useRef } from 'react'

/**
 * Nut "quay lai" — MOT cho duy nhat cho moi kieu phim Back.
 *
 * Moi thiet bi gui Back mot kieu:
 *   - Ban phim:          Escape (Backspace khi KHONG go chu)
 *   - Remote LG webOS:   keyCode 461 (key thuong la "GoBack" hoac rong)
 *   - Remote Samsung:    keyCode 10009 ("XF86Back")
 *   - Android TV / chuot co nut Back: "BrowserBack" (keyCode 166)
 * Truoc day app chi bat Escape/Backspace, nen bam Back tren remote LG khong
 * co tac dung gi trong app.
 *
 * Ai xu ly: NGAN XEP. App dang ky tang duoi cung (dieu huong theo trang);
 * trang xem video, hop thoai... dang ky de len tren khi dang mo. Bam Back chi
 * goi tang TREN CUNG — hop thoai dang mo thi Back dong hop thoai, khong roi
 * trang.
 */

/** Phim Back DANH RIENG cua remote — trinh duyet TV co the tu lui lich su. */
function isRemoteBack(e: KeyboardEvent): boolean {
  return (
    e.keyCode === 461 ||
    e.keyCode === 10009 ||
    e.keyCode === 166 ||
    e.key === 'GoBack' ||
    e.key === 'BrowserBack' ||
    e.key === 'XF86Back'
  )
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  const tag = t?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable === true
}

interface Entry {
  run: () => void
  keepBackspace: boolean
}

const stack: Entry[] = []

function isBackKey(e: KeyboardEvent): boolean {
  if (isRemoteBack(e) || e.key === 'Escape') return true
  if (e.key !== 'Backspace') return false
  // Trong o nhap lieu, Backspace la xoa ky tu. Tang tren cung cung co the
  // giu Backspace cho minh (ban phim so nhap PIN: Backspace = xoa mot so).
  return !isTyping(e) && !stack[stack.length - 1]?.keepBackspace
}

/**
 * Dang ky xu ly Back khi component dang hien. Dang ky SAU = nam TREN.
 * `fn` doi giua cac lan render khong sao — luon goi ban moi nhat.
 */
export function useBackHandler(
  fn: () => void,
  opts: { enabled?: boolean; keepBackspace?: boolean } = {},
): void {
  const { enabled = true, keepBackspace = false } = opts
  const ref = useRef(fn)
  useEffect(() => {
    ref.current = fn
  })

  useEffect(() => {
    if (!enabled) return
    const entry: Entry = { run: () => ref.current(), keepBackspace }
    stack.push(entry)
    return () => {
      const i = stack.lastIndexOf(entry)
      if (i >= 0) stack.splice(i, 1)
    }
  }, [enabled, keepBackspace])
}

/**
 * Trinh duyet TV co the TU lui lich su khi bam Back (LG: he thong goi
 * history.back()), du ta da preventDefault hay chua. Neu ta cung lui them
 * mot buoc thi thanh lui HAI buoc. Nen voi phim Back cua remote: doi mot
 * chut — thay `popstate` (trinh duyet da tu lui, router lo phan con lai)
 * thi thoi; khong thay thi ta tu xu ly.
 */
const NATIVE_BACK_WAIT_MS = 250

/** Gan bat phim Back toan cuc. Goi MOT lan o cap cao (App). */
export function useBackKeys(): void {
  useEffect(() => {
    let lastPop = 0
    let timer: number | undefined

    function onPop(): void {
      lastPop = performance.now()
    }

    function runTop(): void {
      stack[stack.length - 1]?.run()
    }

    function onKey(e: KeyboardEvent): void {
      if (!isBackKey(e)) return
      // Chan o pha CAPTURE: khong de phim nay toi spatial nav hay trinh phat.
      e.preventDefault()
      e.stopPropagation()
      if (e.repeat) return // giu nut khong duoc lui lien tuc ca chuoi trang

      if (!isRemoteBack(e)) {
        runTop()
        return
      }
      const pressedAt = performance.now()
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (lastPop < pressedAt) runTop()
      }, NATIVE_BACK_WAIT_MS)
    }

    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [])
}
