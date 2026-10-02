import type { AdminVideo } from '@/lib/api'

/**
 * Cac trang "Tai them", GAN voi trang 1 ma chung noi tiep.
 *
 * Vi sao phai gan: moi lan trang 1 tai lai (doi bo loc, vua duyet xong, bam
 * 🔄) thi vi tri cua cac trang sau da doi — video vua duyet roi khoi danh sach
 * nen moi thu don len. Giu trang cu lai se ra video TRUNG, va lan "Tai them"
 * sau tinh offset sai nen bo SOT video.
 *
 * `base` la chinh object trang 1 (du lieu cua useLoad). Ben dung so sanh
 * `more.base === trang1` NGAY TRONG LUC RENDER, khong reset bang useEffect:
 * effect chay SAU khi render, nen van co mot khung hinh ghep trang 1 moi voi
 * trang cu (ra video trung). So sanh trong render thi phan cu bi bo tu dau.
 *
 * Cung nho vay ma ket qua "Tai them" ve muon — sau khi trang 1 da doi — tu
 * dong bi bo qua: no gan voi `base` cu, khong khop trang 1 hien tai.
 */
export interface MorePages {
  base: unknown
  items: AdminVideo[]
}

export const NO_MORE: MorePages = { base: null, items: [] }

/** Noi them mot trang vao `prev`, bat dau lai neu `prev` thuoc trang 1 khac. */
export function appendPage(prev: MorePages, base: unknown, items: AdminVideo[]): MorePages {
  return prev.base === base ? { base, items: [...prev.items, ...items] } : { base, items }
}
