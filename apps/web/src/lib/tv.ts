/**
 * Tien ich rieng cho trinh duyet TV (LG webOS).
 */

/**
 * Thu vao fullscreen. PHAI goi tu trong mot user gesture (handler cua click/keydown),
 * neu khong trinh duyet se tu choi.
 *
 * Tren LG webOS khong cai duoc PWA, nen fullscreen la cach duy nhat an thanh
 * dia chi va thanh dieu huong cua trinh duyet. Thanh cong thi giao dien gon gang
 * hon nhieu; that bai thi bo qua lang le — app van dung duoc binh thuong.
 */
export async function tryFullscreen(): Promise<boolean> {
  const el = document.documentElement
  try {
    if (document.fullscreenElement) return true
    if (typeof el.requestFullscreen === 'function') {
      await el.requestFullscreen({ navigationUI: 'hide' })
      return true
    }
    // webOS cu dung tien to webkit.
    const webkit = el as HTMLElement & { webkitRequestFullscreen?: () => void }
    if (typeof webkit.webkitRequestFullscreen === 'function') {
      webkit.webkitRequestFullscreen()
      return true
    }
  } catch {
    // Trinh duyet tu choi (khong phai user gesture, hoac bi chinh sach chan).
  }
  return false
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
