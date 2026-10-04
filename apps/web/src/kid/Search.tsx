import { useEffect, useRef, useState } from 'react'
import { ApiError, type KidConfig, type KidVideo, kidApi, type Quota } from '@/lib/api'
import { useBackHandler } from '@/lib/back'
import { currentMode } from '@/lib/mode'
import { sfx } from '@/lib/sfx'
import { useDebounced } from '@/lib/useDebounced'
import { focusFirst } from '@/nav/spatial'
import { FocusButton } from '@/ui/Focusable'
import { Shelf } from '@/ui/Shelf'
import { EmptyState, Spinner } from '@/ui/Spinner'
import { KidPage } from './KidShell'

/**
 * TIM KIEM cua tre — nut 🔍 ghim dau hang nut chu de o Trang chu va Kenh.
 *
 * Bam 🔍 thi chinh hang do bien thanh o tim (khong mo man hinh moi): tre
 * van o dung cho, bam ← hoac Back la ve lai ke dang xem. Ket qua hien THEO
 * TUNG PHIM GO va da duoc server xep hang — xem `relevance` trong
 * api/src/lib/search.ts. Pham vi la moi video be duoc xem, khong rieng ke
 * hay kenh dang chon.
 */

/** Moi lan "Xem thêm" lay bao nhieu video. */
const PAGE = 60

/** Ngung go bao lau thi tim — du ngan de thay "go toi dau ra toi do". */
const DEBOUNCE_MS = 180

/**
 * O tim dang mo + chu dang go, theo tung (trang, be).
 *
 * Nam NGOAI React vi trang chu bi go khoi cay khi be mo video (App ve Watch
 * thay cho shell). Khong nho thi xem xong bam Back la mat ket qua — be phai
 * go lai tu dau. Chi song trong bo nho: tai lai trang la sach.
 */
const memory = new Map<string, string>()

export type SearchScope = 'home' | 'channels'

export function useSearchState(
  scope: SearchScope,
  profileId: number,
): { open: boolean; memoryKey: string; openSearch: () => void; closeSearch: () => void } {
  const memoryKey = `${scope}:${profileId}`
  const [open, setOpen] = useState(() => memory.has(memoryKey))
  return {
    open,
    memoryKey,
    openSearch: () => {
      if (!memory.has(memoryKey)) memory.set(memoryKey, '')
      setOpen(true)
    },
    closeSearch: () => {
      memory.delete(memoryKey)
      setOpen(false)
    },
  }
}

/**
 * Nut 🔍 tron, chi co hinh: tre chua biet chu van nhan ra kinh lup.
 * `data-no-autofocus`: vao trang thi focus TU DONG khong roi vao day (xem
 * focusFirst) — tre bam OK luc vua vao phai la xem video, khong phai mo o tim.
 */
export function SearchButton({ onOpen }: { onOpen: () => void }): React.ReactElement {
  return (
    <FocusButton
      className="ktab ktab-action ksearch-btn"
      onClick={onOpen}
      aria-label="Tìm video"
      title="Tìm video"
      data-no-autofocus
    >
      <span className="ktab-emoji" aria-hidden="true">
        🔍
      </span>
    </FocusButton>
  )
}

export function SearchPage({
  profileId,
  config,
  memoryKey,
  onSelect,
  onQuota,
  onClose,
}: {
  profileId: number
  config: KidConfig
  memoryKey: string
  onSelect: (v: KidVideo) => void
  onQuota: (quota: Quota) => void
  onClose: () => void
}): React.ReactElement {
  const [initial] = useState(() => memory.get(memoryKey) ?? '')
  const [q, setQ] = useState(initial)
  const query = useDebounced(q.trim(), DEBOUNCE_MS)
  /** Da go nhung debounce chua chay — dung bao "không thấy" voi chu cu. */
  const typing = q.trim() !== query

  const [result, setResult] = useState<{ q: string; videos: KidVideo[]; total: number } | null>(
    null,
  )
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  // Giu callback trong ref — xem ghi chu cung ten trong Home.tsx (vong lap
  // vo han khi de onQuota trong deps).
  const onQuotaRef = useRef(onQuota)
  useEffect(() => {
    onQuotaRef.current = onQuota
  }, [onQuota])

  useEffect(() => {
    memory.set(memoryKey, q)
  }, [memoryKey, q])

  // Back / Esc cua remote = dong o tim, ve lai ke dang xem.
  useBackHandler(() => {
    sfx.back()
    onClose()
  })

  /** "The he" cua ket qua — "Xem thêm" ve muon cua chu cu thi bo. */
  const genRef = useRef(0)

  useEffect(() => {
    genRef.current++
    setLoadingMore(false)
    setError(null)
    if (!query) {
      setResult(null)
      setLoading(false)
      return
    }

    // Huy cau cu: go nhanh thi cau "be" co the ve SAU cau "be heo".
    const ctrl = new AbortController()
    setLoading(true)
    kidApi
      .search(profileId, query, { limit: PAGE, signal: ctrl.signal })
      .then((r) => {
        setResult({ q: query, videos: r.videos, total: r.total })
        onQuotaRef.current(r.quota)
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        setError(err instanceof ApiError ? err.message : 'Không tìm được')
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false)
      })

    return () => ctrl.abort()
  }, [profileId, query])

  async function loadMore(): Promise<void> {
    if (!result || loadingMore) return
    const gen = genRef.current
    const base = result
    setLoadingMore(true)
    try {
      const r = await kidApi.search(profileId, base.q, {
        offset: base.videos.length,
        limit: PAGE,
      })
      if (gen !== genRef.current) return
      setResult((prev) =>
        prev && prev.q === base.q
          ? { ...prev, videos: [...prev.videos, ...r.videos], total: r.total }
          : prev,
      )
      onQuotaRef.current(r.quota)
    } catch {
      /* Giu nguyen nhung gi da co — tre khong can thay thong bao loi o day. */
    } finally {
      if (gen === genRef.current) setLoadingMore(false)
    }
  }

  // Xem video xong quay lai (o tim duoc khoi phuc): tren TV dat focus vao
  // ket qua dau, khong de remote "mat dau". Chi mot lan.
  const restoreFocusRef = useRef(initial !== '')
  useEffect(() => {
    if (!restoreFocusRef.current || !result || result.videos.length === 0) return
    restoreFocusRef.current = false
    if (currentMode() !== 'tv') return
    const id = requestAnimationFrame(() => focusFirst(resultsRef.current))
    return () => cancelAnimationFrame(id)
  }, [result])

  const header = (
    <div className="ktabs-wrap">
      <div className="ktabs-leading">
        <FocusButton
          className="ktab ktab-action ksearch-btn"
          onClick={onClose}
          sound="back"
          aria-label="Đóng tìm kiếm"
          title="Đóng tìm kiếm"
        >
          <span className="ktab-emoji" aria-hidden="true">
            ←
          </span>
        </FocusButton>
      </div>

      {/* Bam vao bat cu dau trong khung (ke ca icon) cung vao o nhap */}
      <div className="ksearch-field" onClick={() => inputRef.current?.focus()}>
        <span className="ksearch-icon" aria-hidden="true">
          🔍
        </span>
        <input
          ref={inputRef}
          data-focusable
          className="ksearch-input"
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={100}
          // Mo moi thi vao go luon; quay lai tu trang xem thi KHONG — ban phim
          // ao bat len che mat ket qua be dang muon chon tiep.
          autoFocus={initial === ''}
          placeholder="Tìm video…"
          aria-label="Tìm video"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            // Dang go thi spatial nav bo qua mui ten — tu chuyen xuong ket qua.
            // Enter cung vay: roi o nhap thi ban phim ao cua TV/tablet dong lai.
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
              if (focusFirst(resultsRef.current)) e.preventDefault()
            }
          }}
        />
        {q ? (
          <FocusButton
            className="ksearch-clear"
            sound="none"
            aria-label="Xoá chữ đã gõ"
            onClick={() => setQ('')}
          >
            ✕
          </FocusButton>
        ) : null}
      </div>
    </div>
  )

  let body: React.ReactNode
  if (error) {
    body = <EmptyState emoji="🔌" title="Có lỗi" hint={error} />
  } else if (!q.trim()) {
    body = (
      <EmptyState
        emoji="🔍"
        title="Con muốn xem gì?"
        hint="Gõ tên video, tên nhân vật hoặc tên kênh. Không cần gõ dấu."
      />
    )
  } else if (!result) {
    body = <Spinner label="Đang tìm…" />
  } else if (result.total === 0 && !loading && !typing) {
    body = (
      <EmptyState
        emoji="🙈"
        title={`Không thấy video nào cho “${result.q}”`}
        hint="Thử gõ ngắn hơn, hoặc gõ từ khác nhé."
      />
    )
  } else {
    // Ket qua cu van hien trong luc tim chu moi — khong loe man trang moi phim.
    const busy = loading || typing
    body = (
      <div className="pb-6">
        <p className="ksearch-meta" aria-live="polite">
          {busy ? 'Đang tìm…' : `${result.total} video`}
        </p>
        <div ref={resultsRef} style={{ opacity: busy ? 0.6 : 1, transition: 'opacity 120ms' }}>
          <Shelf
            color="#ffffff"
            videos={result.videos}
            showDuration={config.showDuration}
            showDownloadBadge={config.showDownloadBadge}
            onSelect={onSelect}
          />
        </div>

        {result.videos.length < result.total ? (
          <div className="flex justify-center">
            <FocusButton
              className="kbtn"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              aria-label={`Xem thêm video. Còn ${result.total - result.videos.length} video nữa.`}
              style={{ background: 'var(--card-hi)', fontWeight: 800 }}
            >
              {loadingMore
                ? 'Đang tải…'
                : `⬇️ Xem thêm (còn ${result.total - result.videos.length})`}
            </FocusButton>
          </div>
        ) : null}
      </div>
    )
  }

  return <KidPage header={header}>{body}</KidPage>
}
