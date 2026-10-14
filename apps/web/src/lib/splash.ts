/**
 * Man khoi dong (ngoi sao chay tren thanh cau vong) nam thang trong
 * index.html de hien ngay khi mo app, truoc ca khi bundle nay tai xong.
 * Script o do tu chay sao va tu go man khi xong; ta chi bao "app san sang".
 */

declare global {
  interface Window {
    __kidtubeSplashDone?: () => void
  }
}

/** Goi khi app da co the ve giao dien. Goi nhieu lan cung khong sao. */
export function hideSplash(): void {
  window.__kidtubeSplashDone?.()
}
