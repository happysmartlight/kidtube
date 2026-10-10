import { useEffect, useState } from 'react'

/**
 * Cai app (PWA) len dien thoai / tablet.
 *
 * Chrome chi cho cai khi trang chay HTTPS duoc tin (secure context) — o nha
 * la link https://<may>.<tailnet>.ts.net cua `tailscale serve`, xem muc
 * "Cài app" trong Cai dat. Khi du dieu kien, Chrome ban su kien
 * `beforeinstallprompt`; ta giu lai de nut "Cài app" trong trang Cai dat bam
 * duoc, thay vi de Chrome tu hien thanh moi cai o giao dien cua be (be bam
 * nham vao do thi chang de lam gi).
 *
 * Safari (iOS/iPadOS) khong co su kien nay: chi cai bang tay qua nut Chia se.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

function notify(): void {
  for (const fn of listeners) fn()
}

/** Goi MOT lan, cang som cang tot: su kien co the ban ngay khi trang vua tai. */
export function initPwa(): void {
  // App da cai tren iPhone/iPad: CSS can sua chieu cao — xem `ios-standalone`
  // trong index.css. `navigator.standalone` chi iOS co, va chi true khi mo tu
  // icon tren man hinh chinh.
  if (isIosStandalone()) document.documentElement.classList.add('ios-standalone')

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

/** Chrome da san sang hien hop "Cài đặt ứng dụng" chua. */
export function useInstallPrompt(): boolean {
  const [ready, setReady] = useState(deferred !== null)
  useEffect(() => {
    const fn = (): void => setReady(deferred !== null)
    listeners.add(fn)
    fn()
    return () => {
      listeners.delete(fn)
    }
  }, [])
  return ready
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const e = deferred
  if (!e) return 'unavailable'
  // Moi su kien chi prompt() duoc mot lan.
  deferred = null
  notify()
  await e.prompt()
  const { outcome } = await e.userChoice
  return outcome
}

/**
 * Dang chay dang app da cai (mo tu icon tren man hinh chinh), khong phai tab
 * trinh duyet.
 *
 * `display-mode: fullscreen` CUNG khop khi tab trinh duyet dang o che do toan
 * man hinh qua Fullscreen API — nen loai truong hop co fullscreenElement.
 */
export function isInstalled(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  if (nav.standalone === true) return true // Safari iOS
  const mq = (q: string): boolean => window.matchMedia(`(display-mode: ${q})`).matches
  if (mq('standalone') || mq('minimal-ui')) return true
  return mq('fullscreen') && !fullscreenElement()
}

export function isIosStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/**
 * Thong so chieu cao man hinh that, de bo me chup gui khi giao dien bi hut /
 * du o day tren mot may cu the — loi kieu nay gia lap tren may tinh khong tai
 * hien duoc. Do bang phan tu tam vi `100vh`, `env()` khong doc truc tiep bang
 * JS duoc.
 */
export function screenMetrics(): string {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;top:0;left:0;width:1px;visibility:hidden;pointer-events:none'
  document.body.appendChild(probe)
  const measure = (css: string): string => {
    probe.style.height = ''
    probe.style.height = css
    // Don vi khong ho tro thi gan khong an — bao "-" thay vi so sai.
    return probe.style.height ? String(Math.round(probe.getBoundingClientRect().height)) : '-'
  }
  const vh = measure('100vh')
  const dvh = measure('100dvh')
  const lvh = measure('100lvh')
  const top = measure('env(safe-area-inset-top)')
  const bottom = measure('env(safe-area-inset-bottom)')
  probe.remove()

  const html = Math.round(document.documentElement.getBoundingClientRect().height)
  const vv = window.visualViewport ? Math.round(window.visualViewport.height) : '-'
  return [
    `screen ${screen.width}×${screen.height}`,
    `inner ${innerWidth}×${innerHeight}`,
    `vv ${vv}`,
    `vh ${vh} · dvh ${dvh} · lvh ${lvh}`,
    `html ${html}`,
    `inset ${top}/${bottom}`,
    `ios-app ${isIosStandalone() ? 'có' : 'không'}`,
  ].join(' · ')
}

export function fullscreenElement(): Element | null {
  const doc = document as Document & { webkitFullscreenElement?: Element | null }
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null
}

export type Platform = 'ios' | 'android' | 'other'

export function detectPlatform(): Platform {
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  // iPadOS 13+ tu xung la Mac — phan biet bang man hinh cam ung.
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return 'ios'
  return 'other'
}
