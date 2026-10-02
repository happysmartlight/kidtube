/**
 * Tim kiem tieng Viet "thong minh".
 *
 * Van de cua `title LIKE '%q%'` tho:
 *   1. SQLite chi doi hoa-thuong cho ASCII. Go "be" KHONG ra "Bé",
 *      go "Heo" KHONG ra "heo" khi co dau — nguoi dung thay "khong co gi".
 *   2. Khong bo dau: "be heo" phai go dung "bé heo" moi ra.
 *   3. Mot khoi lien tuc: "heo peppa" khong ra "Peppa Pig va chu heo con"
 *      vi thu tu tu khac nhau.
 *
 * Cach giai: luu san mot ban DA CHUAN HOA cua title + channel_title vao cot
 * `videos.search_text` (bo dau, viet thuong), roi tim bang AND cua TUNG TU
 * da chuan hoa. Nho vay go kieu gi cung ra:
 *   "be heo"     -> %be% AND %heo%
 *   "heo peppa"  -> %heo% AND %peppa%   (ra "Peppa Pig va chu heo con")
 *   "BÉ Heo"     -> %be% AND %heo%
 */

/** Dai dau phu Unicode (dau thanh, mu, moc) sinh ra sau khi normalize('NFD'). */
const COMBINING_MARKS = /[̀-ͯ]/g

/**
 * Bo dau tieng Viet + viet thuong.
 *
 * NFD tach "ế" thanh "e" + dau, roi xoa dai dau phu — cach nay xu ly duoc ca
 * nguyen am co mu/moc (ă, ơ, ư) vi chung cung phan ra thanh chu goc + dau phu.
 * Chu "đ" la ngoai le: Unicode khong phan ra duoc nen phai thay tay.
 */
export function normalizeVi(input: string): string {
  return input
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/g, 'd') // đ
    .replace(/Đ/g, 'd') // Đ
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Ghep title + channel_title thanh chuoi de tim.
 * Goi moi khi ghi video vao DB (xem services/ingest.ts) va khi backfill
 * (xem db/index.ts).
 */
export function buildSearchText(title: string, channelTitle?: string | null): string {
  return normalizeVi(`${title} ${channelTitle ?? ''}`)
}

/** So tu khoa toi da — chan truong hop dan ca doan van vao o tim. */
const MAX_TOKENS = 8

/**
 * Tach cau truy van thanh cac tu khoa da chuan hoa.
 *
 * TACH tai moi ky tu khong phai chu/so (khoang trang, gach noi, dau hai cham,
 * dau cong...), KHONG xoa chung roi dinh lien. Ban cu xoa dau cau ben trong
 * tu nen "peppa-pig" thanh "peppapig" — khong khop tieu de "Peppa-Pig" (trong
 * search_text van con dau gach). Tach ra thanh "peppa" + "pig" thi ca hai deu
 * la chuoi con cua "peppa-pig", va cua "peppa pig" luon.
 */
export function searchTokens(q: string): string[] {
  return normalizeVi(q)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0)
    .slice(0, MAX_TOKENS)
}

/**
 * Sinh dieu kien WHERE cho mot cau tim kiem.
 *
 * Tra ve `null` khi khong co tu khoa nao dung duoc (o tim rong, hoac nguoi
 * dung chi go dau cau) — ben goi hieu la "khong loc gi".
 *
 * @param column Cot da chuan hoa, vi du `v.search_text`.
 */
export function searchClause(
  q: string | undefined,
  column: string,
): { sql: string; params: string[] } | null {
  const tokens = searchTokens(q ?? '')
  if (tokens.length === 0) return null

  return {
    // searchTokens hien chi tra ve chu/so nen %, _ khong lot vao duoc. Van
    // escape de phong ho: neu sau nay doi cach tach tu ma de lot "%", khong
    // escape thi go "100%" se match moi thu.
    sql: tokens.map(() => `${column} LIKE ? ESCAPE '\\'`).join(' AND '),
    params: tokens.map((t) => `%${escapeLike(t)}%`),
  }
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}
