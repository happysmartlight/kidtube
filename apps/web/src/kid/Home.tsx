import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, type KidConfig, type KidVideo, kidApi, type Quota } from '@/lib/api'
import { useAutoFocus } from '@/nav/spatial'
import { FocusButton } from '@/ui/Focusable'
import { Shelf } from '@/ui/Shelf'
import { EmptyState, Spinner } from '@/ui/Spinner'
import { type Topic, TopicTabs } from './TopicTabs'

/** Moi lan "Xem them" lay bao nhieu video. */
const PAGE = 60

/**
 * Trang chu cua tre: HANG NUT CHON CHU DE + LUOI video cua chu de dang chon.
 *
 * Truoc day moi ke la mot hang cuon ngang, cac ke xep chong theo chieu doc.
 * Hai van de thuc te:
 *   - Ke nhieu video thi keo sang phai mai khong het, va khong nhin bao quat
 *     duoc. Luoi cuon doc cho thay nhieu video hon trong mot lan nhin.
 *   - Tre KHONG BIET ben duoi con ke nao cho den khi cuon qua het ke tren.
 *     Hang nut dinh o dau mang moi chu de ve trong tam voi mot cu cham.
 *
 * Moi lan chi tai video cua MOT ke, theo trang — khong nhoi hang nghin
 * thumbnail vao DOM cung luc (TV box doi cu se dung hinh).
 */
interface HomeProps {
  profileId: number
  config: KidConfig
  onSelect: (video: KidVideo) => void
  onQuota: (quota: Quota) => void
}

export function Home({ profileId, config, onSelect, onQuota }: HomeProps): React.ReactElement {
  return (
    <TopicBrowser
      key={`home-${profileId}`}
      profileId={profileId}
      config={config}
      onSelect={onSelect}
      onQuota={onQuota}
      kind="shelf"
    />
  )
}

// ═══ Kenh ═══════════════════════════════════════════════════════════

/**
 * Tab "Kênh" dung y het bo cuc cua trang chu — chi khac nguon du lieu.
 * Hai bo cuc khac nhau trong cung mot app la thu tre phai hoc hai lan.
 */
export function Channels({
  profileId,
  config,
  onSelect,
  onQuota,
}: {
  profileId: number
  config: KidConfig
  onSelect: (v: KidVideo) => void
  onQuota: (quota: Quota) => void
}): React.ReactElement {
  return (
    <TopicBrowser
      key={`channels-${profileId}`}
      profileId={profileId}
      config={config}
      onSelect={onSelect}
      onQuota={onQuota}
      kind="channel"
    />
  )
}

// ═══ Phan dung chung ════════════════════════════════════════════════

const CHANNEL_COLORS = ['#4ecdc4', '#a78bfa', '#ff9f43', '#5b9cff', '#f472b6', '#4ecb71']

function TopicBrowser({
  profileId,
  config,
  onSelect,
  onQuota,
  kind,
}: {
  profileId: number
  config: KidConfig
  onSelect: (v: KidVideo) => void
  onQuota: (quota: Quota) => void
  kind: 'shelf' | 'channel'
}): React.ReactElement {
  const [topics, setTopics] = useState<Topic[] | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [videos, setVideos] = useState<KidVideo[]>([])
  const [total, setTotal] = useState(0)
  // Bat dau la `true`: ngay sau khi danh sach chu de ve, co dung mot lan
  // render ma video chua kip tai — de `false` thi tre thay loe mot luoi rong.
  const [loadingVideos, setLoadingVideos] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Giu callback trong ref thay vi de trong deps cua useEffect.
   *
   * `onQuota` goi setState o component cha nen moi lan chay sinh mot identity
   * MOI. De no trong deps thi: effect chay -> onQuota -> cha render lai ->
   * onQuota moi -> effect chay lai -> VONG LAP VO HAN goi API lien tuc
   * (da tung xay ra, phat hien khi test bang browser).
   */
  const onQuotaRef = useRef(onQuota)
  useEffect(() => {
    onQuotaRef.current = onQuota
  }, [onQuota])

  // ─── Lay danh sach chu de ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setTopics(null)
    setSelectedId(null)
    setError(null)

    const load =
      kind === 'shelf'
        ? kidApi.shelves(profileId).then((r) => ({
            topics: r.shelves as Topic[],
            quota: r.quota as Quota | null,
          }))
        : kidApi.channels(profileId).then((r) => ({
            topics: r.channels.map((c, i) => ({
              id: c.id,
              title: c.title,
              emoji: '📺',
              // Kenh khong co mau rieng trong DB — gan mau theo thu tu de
              // tre phan biet duoc cac nut bang mau, khong chi bang chu.
              color: CHANNEL_COLORS[i % CHANNEL_COLORS.length] ?? '#4ecdc4',
              total: c.total,
            })),
            quota: r.quota as Quota | null,
          }))

    load
      .then(({ topics: list, quota }) => {
        if (cancelled) return
        setTopics(list)
        setSelectedId(list[0]?.id ?? null)
        if (quota) onQuotaRef.current(quota)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Không tải được danh sách')
      })

    return () => {
      cancelled = true
    }
  }, [profileId, kind])

  // ─── Lay video cua chu de dang chon ──────────────────────────────
  const fetchPage = useCallback(
    (id: number, offset: number) =>
      kind === 'shelf'
        ? kidApi.shelf(id, profileId, offset, PAGE)
        : kidApi.channel(id, profileId, offset, PAGE),
    [kind, profileId],
  )

  /**
   * "The he" cua danh sach — tang moi khi doi chu de (ke hoac kenh).
   *
   * "Xem them" dang cho ma tre cham sang chu de khac thi ket qua ve muon la
   * cua chu de CU. Khong kiem tra the he thi no bi noi vao luoi cua chu de
   * moi: video sai cho, va lan "Xem them" sau tinh offset sai. Tre hay bam
   * lien tuc nen chuyen nay de xay ra hon ta tuong.
   */
  const genRef = useRef(0)

  useEffect(() => {
    if (selectedId === null) return
    let cancelled = false
    genRef.current++
    setLoadingVideos(true)
    setLoadingMore(false)
    setVideos([])
    setTotal(0)

    fetchPage(selectedId, 0)
      .then((r) => {
        if (cancelled) return
        setVideos(r.videos)
        setTotal(r.total)
        onQuotaRef.current(r.quota)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Không tải được video')
      })
      .finally(() => {
        if (!cancelled) setLoadingVideos(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedId, fetchPage])

  async function loadMore(): Promise<void> {
    if (selectedId === null || loadingMore) return
    const gen = genRef.current
    setLoadingMore(true)
    try {
      const r = await fetchPage(selectedId, videos.length)
      // Da doi chu de trong luc cho -> day la ket qua cua chu de cu, bo di.
      if (gen !== genRef.current) return
      setVideos((prev) => [...prev, ...r.videos])
      setTotal(r.total)
      onQuotaRef.current(r.quota)
    } catch {
      /* Giu nguyen nhung gi da co — tre khong can thay thong bao loi o day. */
    } finally {
      // The he moi da tu dat lai loadingMore — dung de lenh cu ghi de len.
      if (gen === genRef.current) setLoadingMore(false)
    }
  }

  if (error) return <EmptyState emoji="🔌" title="Có lỗi" hint={error} />
  if (!topics) return <Spinner label="Đang tải…" />

  if (topics.length === 0) {
    return kind === 'shelf' ? (
      <EmptyState
        emoji="🧺"
        title="Chưa có video nào"
        hint={
          'Bố mẹ cần duyệt video rồi xếp vào kệ thì con mới xem được. ' +
          'Giữ icon ⚙ ở góc dưới bên phải 3 giây để vào trang bố mẹ.'
        }
      />
    ) : (
      <EmptyState
        emoji="📺"
        title="Chưa có kênh nào"
        hint="Bố mẹ thêm kênh trong trang quản lý thì các kênh sẽ hiện ở đây."
      />
    )
  }

  const current = topics.find((t) => t.id === selectedId) ?? topics[0]!

  return (
    <>
      <TopicTabs
        topics={topics}
        selectedId={selectedId}
        onSelect={setSelectedId}
        label={kind === 'shelf' ? 'Chọn kệ video' : 'Chọn kênh'}
      />

      <TopicVideos
        topic={current}
        videos={videos}
        total={total}
        loading={loadingVideos}
        loadingMore={loadingMore}
        config={config}
        onSelect={onSelect}
        onLoadMore={() => void loadMore()}
      />
    </>
  )
}

function TopicVideos({
  topic,
  videos,
  total,
  loading,
  loadingMore,
  config,
  onSelect,
  onLoadMore,
}: {
  topic: Topic
  videos: KidVideo[]
  total: number
  loading: boolean
  loadingMore: boolean
  config: KidConfig
  onSelect: (v: KidVideo) => void
  onLoadMore: () => void
}): React.ReactElement {
  // Chi dat focus lan dau vao chu de — khong cuop focus khi tre bam doi ke,
  // vi luc do tre dang o tren hang nut va con muon bam tiep.
  useAutoFocus(videos.length > 0, [topic.id])

  if (loading) return <Spinner label="Đang tải…" />

  return (
    <div className="pb-6">
      {/* Khong co tieu de: nut dang sang o tren da ghi ten chu de roi. */}
      <Shelf
        color={topic.color}
        videos={videos}
        showDuration={config.showDuration}
        showDownloadBadge={config.showDownloadBadge}
        onSelect={onSelect}
      />

      {videos.length < total ? (
        <div className="flex justify-center">
          <FocusButton
            className="kbtn"
            onClick={onLoadMore}
            disabled={loadingMore}
            aria-label={`Xem thêm video. Còn ${total - videos.length} video nữa.`}
            style={{ background: 'var(--card-hi)', fontWeight: 800 }}
          >
            {loadingMore ? 'Đang tải…' : `⬇️ Xem thêm (còn ${total - videos.length})`}
          </FocusButton>
        </div>
      ) : null}
    </div>
  )
}

// ═══ Yeu thich ══════════════════════════════════════════════════════

export function Favorites({
  profileId,
  config,
  onSelect,
}: {
  profileId: number
  config: KidConfig
  onSelect: (v: KidVideo) => void
}): React.ReactElement {
  const [videos, setVideos] = useState<KidVideo[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setVideos(null)
    kidApi
      .favorites(profileId)
      .then((r) => {
        if (!cancelled) setVideos(r.videos)
      })
      .catch(() => {
        if (!cancelled) setVideos([])
      })
    return () => {
      cancelled = true
    }
  }, [profileId])

  if (!videos) return <Spinner label="Đang tải…" />

  if (videos.length === 0) {
    return (
      <EmptyState
        emoji="🤍"
        title="Chưa có video yêu thích"
        hint="Khi đang xem, bấm hình trái tim để lưu video vào đây nhé!"
      />
    )
  }

  return (
    <div className="py-4">
      <Shelf
        title="VIDEO CON THÍCH"
        emoji="❤️"
        color="#ff6b8a"
        videos={videos}
        showDuration={config.showDuration}
        showDownloadBadge={config.showDownloadBadge}
        onSelect={onSelect}
      />
    </div>
  )
}
