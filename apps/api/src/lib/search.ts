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

/** `needle` xuat hien o DAU mot tu cua `hay` (khong phai giua tu). */
function atWordStart(hay: string, needle: string): boolean {
  let i = hay.indexOf(needle)
  while (i !== -1) {
    if (i === 0 || !/[\p{L}\p{N}]/u.test(hay[i - 1]!)) return true
    i = hay.indexOf(needle, i + 1)
  }
  return false
}

/**
 * Diem lien quan cua mot video voi cau tim — de xep ket qua tim cua TRE.
 *
 * `searchClause` chi LOC (moi tu deu co mat o dau do); con thu tu thi tre
 * can cai sat nhat len dau, vi tre khong cuon qua vai hang. Thu tu uu tien:
 *   1. Tieu de trung khop / bat dau bang ca cum tu da go
 *   2. Ca cum tu dung lien nhau o dau mot tu, roi o bat ky dau
 *   3. Tung tu: khop DAU tu > khop giua tu; khop tieu de > chi khop ten kenh
 *      ("heo" ra "Heo Peppa" truoc "Chuheo", truoc video cua kenh "Heo TV")
 *   4. Tieu de ngan hon — "Bé Heo" sat voi "be heo" hon mot tieu de dai 80
 *      ky tu co lan dau hai tu do
 * Bang diem thi ben goi xep tiep theo luot xem (video con hay xem) roi do moi.
 *
 * @param tokens Ket qua cua `searchTokens` (da chuan hoa).
 */
export function relevance(tokens: string[], title: string, channelTitle: string | null): number {
  if (tokens.length === 0) return 0
  const t = normalizeVi(title)
  const c = normalizeVi(channelTitle ?? '')
  const phrase = tokens.join(' ')

  let score = 0
  if (t === phrase) score += 1000
  else if (t.startsWith(phrase)) score += 600
  else if (atWordStart(t, phrase)) score += 400
  else if (t.includes(phrase)) score += 250

  for (const tok of tokens) {
    if (atWordStart(t, tok)) score += 40
    else if (t.includes(tok)) score += 15
    else if (atWordStart(c, tok)) score += 8
    else score += 2 // chi khop giua mot tu cua ten kenh
  }

  // Tru theo BAC 25 ky tu, khong tru le tung ky tu: hai tieu de dai xap xi
  // thi hoa diem, de luot xem (ben goi) quyet dinh — chenh nhau 1 ky tu khong
  // phai ly do de day video con hay xem xuong duoi.
  return score - Math.floor(Math.min(t.length, 200) / 25)
}
