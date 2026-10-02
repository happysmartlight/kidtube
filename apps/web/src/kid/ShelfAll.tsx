import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, type KidConfig, type KidShelfPage, type KidVideo, kidApi, type Quota } from '@/lib/api'
import { useAutoFocus } from '@/nav/spatial'
import { FocusButton } from '@/ui/Focusable'
import { Shelf } from '@/ui/Shelf'
import { EmptyState, Spinner } from '@/ui/Spinner'

/** Moi lan "Xem them" lay bao nhieu video. */
const PAGE = 60

interface ShelfAllProps {
  /** Ke (`shelf`) hay kenh (`channel`) — chi khac endpoint. */
  kind: 'shelf' | 'channel'
  id: number
  profileId: number
  config: KidConfig
  onSelect: (video: KidVideo) => void
  onQuota: (quota: Quota) => void
  onBack: () => void
}

/**
 * Trang "Xem tat ca" cua mot ke (hoac mot kenh).
 *
 * Vi sao can trang nay: trang chu hien moi ke thanh mot HANG CUON NGANG.
 * Voi ke co 500-1000 video, tre phai bam phai hang tram lan moi tham duoc
 * cai cuoi — coi nhu nhung video do khong ton tai. O day hien dang LUOI cuon
 * doc, co nut "Xem them" o cuoi.
 *
 * Van tai theo trang (khong nhoi het mot luc): hang nghin thumbnail cung luc
 * lam TV box doi cu bi dung hinh.
 */
export function ShelfAll({
  kind,
  id,
  profileId,
  config,
  onSelect,
  onQuota,
  onBack,
}: ShelfAllProps): React.ReactElement {
  const [page, setPage] = useState<KidShelfPage | null>(null)
  const [videos, setVideos] = useState<KidVideo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  // Cung ly do nhu trong Home: onQuota sinh identity moi moi render cua cha,
  // de trong deps cua useEffect se thanh vong lap vo han.
  const onQuotaRef = useRef(onQuota)
  useEffect(() => {
    onQuotaRef.current = onQuota
  }, [onQuota])

  const fetchPage = useCallback(
    (offset: number) => (kind === 'shelf' ? kidApi.shelf(id, profileId, offset, PAGE) : kidApi.channel(id, profileId, offset, PAGE)),
    [kind, id, profileId],
  )

  useEffect(() => {
    let cancelled = false
    setPage(null)
    setVideos([])
    setError(null)

    fetchPage(0)
      .then((r) => {
        if (cancelled) return
        setPage(r)
        setVideos(r.videos)
        onQuotaRef.current(r.quota)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Không tải được danh sách')
      })

    return () => {
      cancelled = true
    }
  }, [fetchPage])

  async function loadMore(): Promise<void> {
    setLoadingMore(true)
    try {
      const r = await fetchPage(videos.length)
      setVideos((prev) => [...prev, ...r.videos])
      setPage(r)
      onQuotaRef.current(r.quota)
    } catch {
      /* Giu nguyen nhung gi da co — tre khong can thay thong bao loi o day. */
    } finally {
      setLoadingMore(false)
    }
  }

  if (error) return <EmptyState emoji="🔌" title="Có lỗi" hint={error} />
  if (!page) return <Spinner label="Đang tải…" />

  return (
    <Content
      page={page}
      videos={videos}
      config={config}
      loadingMore={loadingMore}
      hasMore={videos.length < page.total}
      onSelect={onSelect}
      onLoadMore={() => void loadMore()}
      onBack={onBack}
    />
  )
}

function Content({
  page,
  videos,
  config,
  loadingMore,
  hasMore,
  onSelect,
  onLoadMore,
  onBack,
}: {
  page: KidShelfPage
  videos: KidVideo[]
  config: KidConfig
  loadingMore: boolean
  hasMore: boolean
  onSelect: (v: KidVideo) => void
  onLoadMore: () => void
  onBack: () => void
}): React.ReactElement {
  useAutoFocus(videos.length > 0, [page.shelf.id])

  return (
    <div className="py-4">
      {/* Nut quay lai — tre dung cham tay khong co phim Back nhu remote TV */}
      <div style={{ paddingLeft: 'var(--safe-pad)', paddingRight: 'var(--safe-pad)' }}>
        <FocusButton
          className="kbtn mb-3"
          sound="back"
          onClick={onBack}
          aria-label="Quay lại trang trước"
          style={{ background: 'var(--card)', border: 'none', cursor: 'pointer', padding: '0 20px' }}
        >
          ⬅️ Quay lại
        </FocusButton>
      </div>

      <Shelf
        title={`${page.shelf.title.toUpperCase()} — ${page.total} VIDEO`}
        emoji={page.shelf.emoji}
        color={page.shelf.color}
        videos={videos}
        showDuration={config.showDuration}
        showDownloadBadge={config.showDownloadBadge}
        onSelect={onSelect}
        grid
      />

      {hasMore ? (
        <div className="flex justify-center pb-6">
          <FocusButton
            className="kbtn"
            onClick={onLoadMore}
            disabled={loadingMore}
            aria-label={`Xem thêm video. Còn ${page.total - videos.length} video nữa.`}
            style={{
              background: 'var(--card-hi)',
              border: 'none',
              cursor: 'pointer',
              padding: '0 28px',
              fontSize: 'var(--font-title)',
              fontWeight: 800,
            }}
          >
            {loadingMore ? 'Đang tải…' : `⬇️ Xem thêm (còn ${page.total - videos.length})`}
          </FocusButton>
        </div>
      ) : null}
    </div>
  )
}
