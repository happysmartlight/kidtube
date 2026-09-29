/**
 * Luu tru cuc bo tren thiet bi — chi dung cho tien loi, khong bao gio
 * cho du lieu phai chinh xac (quota tinh o server, nguyen tac P5).
 *
 * Moi truy cap deu bao boc try/catch: cua so an danh hoac trinh duyet
 * chan luu tru se nem loi khi doc/ghi.
 */

const PROFILE_KEY = 'kidtube.profileId'

export function getStoredProfileId(): number | null {
  try {
    const v = localStorage.getItem(PROFILE_KEY)
    if (!v) return null
    const n = Number.parseInt(v, 10)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

export function setStoredProfileId(id: number | null): void {
  try {
    if (id === null) localStorage.removeItem(PROFILE_KEY)
    else localStorage.setItem(PROFILE_KEY, String(id))
  } catch {
    /* khong luu duoc thi moi lan mo phai chon lai be — chap nhan duoc */
  }
}
