import { useEffect } from 'react'
import { fullscreenElement, isInstalled } from './pwa'

/**
 * Tien ich cho trinh duyet TV (LG webOS) va tablet chua cai app.
 */

let requesting = false

/**
 * Thu vao fullscreen. PHAI goi tu trong mot user gesture (handler cua click/keydown),
 * neu khong trinh duyet se tu choi.
 *
 * Tren LG webOS khong cai duoc PWA, nen fullscreen la cach duy nhat an thanh
 * dia chi va thanh dieu huong cua trinh duyet. Tablet chua cai app cung vay.
 * Thanh cong thi giao dien gon gang hon nhieu; that bai thi bo qua lang le —
 * app van dung duoc binh thuong.
 */
export async function tryFullscreen(): Promise<boolean> {
  // App da cai tu chay toan man hinh. Xin them thi nut Back cua may chi
  // thoat fullscreen, phai bam hai lan moi lui duoc.
  if (isInstalled() || fullscreenElement()) return true
  // Chon be = mot cu bam goi ham nay HAI lan (o ProfilePick va useAutoFullscreen).
  if (requesting) return false

  const el = document.documentElement
  requesting = true
  try {
    if (typeof el.requestFullscreen === 'function') {
      await el.requestFullscreen({ navigationUI: 'hide' })
      return true
    }
    // webOS cu va Safari iPad cu dung tien to webkit.
    const webkit = el as HTMLElement & { webkitRequestFullscreen?: () => void }
    if (typeof webkit.webkitRequestFullscreen === 'function') {
      webkit.webkitRequestFullscreen()
      return true
    }
  } catch {
    // Trinh duyet tu choi (khong phai user gesture, hoac bi chinh sach chan).
  } finally {
    requesting = false
  }
  return false
}

/**
 * Tablet / dien thoai CHUA cai app: cham vao giao dien cua be luc dang khong
 * o toan man hinh thi xin vao lai.
 *
 * Truoc day chi xin luc chon be — nhung app nho be da chon, nen mo lai la vao
 * thang Trang chu va thanh dia chi o lai mai. Be vuot thoat ra (hoac bam Back)
 * thi lan cham ke tiep lai an no di.
 *
 * Chi bat tren man hinh cam ung: bo me thu tren laptop khong muon bi day vao
 * toan man hinh. iPhone khong ho tro Fullscreen API — o do chi co cach cai app.
 */
export function useAutoFullscreen(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !window.matchMedia('(pointer: coarse)').matches) return
    const onClick = (): void => {
      void tryFullscreen()
    }
    // Pha capture: van chay ke ca khi nut ben trong chan noi bot su kien.
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [enabled])
}

/**
 * `scrollIntoView` voi doi tuong tuy chon khong duoc ho tro dong bo tren moi
 * trinh duyet TV: ban cu chi nhan doi so boolean. Neu truyen object ma trinh
 * duyet khong hieu, mot so ban cuon VE DAU TRANG thay vi cuon toi element —
 * lam mat focus cua tre.
 */
export function safeScrollIntoView(el: HTMLElement): void {
  try {
    el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  } catch {
    try {
      el.scrollIntoView(false)
    } catch {
      /* khong cuon duoc thi thoi */
    }
  }
}
