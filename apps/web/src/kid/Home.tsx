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
    />
  )
}

// ═══ Kham pha (tab "Kênh") ══════════════════════════════════════════

function newSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}

/**
 * Tab "Kênh": video da duyet, TRON NGAU NHIEN.
 *
 * Vi sao doi tu "duyet theo kenh" sang the nay: trang chu da sap theo ke
 * (thu tu bo me xep), nen video cu bi day xuong duoi va gan nhu khong bao gio
 * duoc xem lai. Cho nay lam nhiem vu nguoc lai — moi lan mo la mot bo khac.
 *
 * Nut "Làm mới" doi `seed`. Cung seed thi thu tu co dinh, nen "Xem thêm" lay
 * dung phan tiep theo chu khong lap lai video da hien (xem seeded_rand trong
 * api/src/db/index.ts). Loc kenh thi chi tron trong kenh do.
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
  /**
   * Danh sach kenh + tong so video, lay MOT lan khi vao tab.
   *
   * So lieu tren cac nut (ke ca "Tất cả") va viec hien nut "Làm mới" deu lay
   * tu day, KHONG tu ket qua dang tai: ket qua do bi xoa ve 0 moi lan tai lai,
   * nen truoc day nut "Làm mới" bien mat ngay khi bam roi hien lai (ca hang
   * nut giat qua lai), con nut "Tất cả" thi hien so cua kenh dang chon.
   */
  const [catalog, setCatalog] = useState<{ channels: Topic[]; total: number } | null>(null)
  // 0 = tron toan bo, khong loc kenh.
  const [sourceId, setSourceId] = useState(0)
  const [seed, setSeed] = useState(newSeed)

  const [videos, setVideos] = useState<KidVideo[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onQuotaRef = useRef(onQuota)
  useEffect(() => {
    onQuotaRef.current = onQuota
  }, [onQuota])

  // ─── Danh sach kenh cho hang nut ─────────────────────────────────
  useEffect(() => {
    let cancelled = false
    kidApi
      .channels(profileId)
      .then((r) => {
        if (cancelled) return
        setCatalog({
          channels: r.channels.map((c, i) => ({
            id: c.id,
            title: c.title,
            emoji: '📺',
            // Kenh khong co mau rieng trong DB — gan mau theo thu tu de tre
            // phan biet duoc cac nut bang mau, khong chi bang chu.
            color: CHANNEL_COLORS[i % CHANNEL_COLORS.length] ?? '#4ecdc4',
            total: c.total,
          })),
          total: r.total,
        })
      })
      .catch((err: unknown) => {
        // Bao loi that, dung gia vo "chua co video" — loi mang khac han viec
        // bo me chua duyet gi.
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Không tải được danh sách')
      })
    return () => {
      cancelled = true
    }
  }, [profileId])

  /**
   * "The he" cua danh sach — tang moi khi doi kenh hoac bam "Làm mới".
   * Ket qua "Xem thêm" ve muon cua the he cu se bi bo, khong noi vao danh
   * sach moi (neu khong: video sai kenh, hoac video TRUNG sau khi xao lai).
   */
  const genRef = useRef(0)

  // ─── Video (doi khi doi kenh hoac bam Lam moi) ───────────────────
  useEffect(() => {
    let cancelled = false
    genRef.current++
    setLoading(true)
    setLoadingMore(false)
    setVideos([])
    setTotal(0)
    setError(null)

    kidApi
      .discover(profileId, { seed, sourceId, limit: PAGE })
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
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [profileId, sourceId, seed])

  async function loadMore(): Promise<void> {
    if (loadingMore) return
    const gen = genRef.current
    setLoadingMore(true)
    try {
      const r = await kidApi.discover(profileId, {
        seed,
        sourceId,
        offset: videos.length,
        limit: PAGE,
      })
      // Da doi kenh / bam "Làm mới" trong luc cho -> ket qua cu, bo di.
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
  if (catalog === null) return <Spinner label="Đang tải…" />

  // Dung tong chu khong dung so kenh: van co the co video ma khong thuoc kenh
  // nao trong danh sach (nguon da tat / da xoa) — van xem duoc o "Tất cả".
  if (catalog.total === 0) {
    return (
      <EmptyState
        emoji="🎲"
        title="Chưa có video nào"
        hint="Bố mẹ cần duyệt video trong trang quản lý thì ở đây mới có gì để xem."
      />
    )
  }

  const topics: Topic[] = [
    { id: 0, title: 'Tất cả', emoji: '🎲', color: '#ffd23f', total: catalog.total },
    ...catalog.channels,
  ]

  // Khi tat ca video vua trong MOT trang thi xao tron chi doi thu tu cua dung
  // bay nhieu video — khong co gi moi de xem, nen an nut di cho do roi mat.
  // Lay so tu nut dang chon (on dinh), khong tu ket qua dang tai (ve 0 khi tai).
  const selectedTotal = topics.find((t) => t.id === sourceId)?.total ?? 0
  const canShuffle = selectedTotal > PAGE

  return (
    <>
      <TopicTabs
        topics={topics}
        selectedId={sourceId}
        onSelect={setSourceId}
        label="Chọn kênh"
        leading={
          canShuffle ? (
            <FocusButton
              className="ktab ktab-action"
              onClick={() => setSeed(newSeed())}
              aria-label="Làm mới — xem bộ video khác"
            >
              <span className="ktab-emoji" aria-hidden="true">
                🔀
              </span>
              <span className="ktab-title">Làm mới</span>
            </FocusButton>
          ) : null
        }
      />

      <DiscoverVideos
        videos={videos}
        total={total}
        sourceId={sourceId}
        loading={loading}
        loadingMore={loadingMore}
        config={config}
        onSelect={onSelect}
        onLoadMore={() => void loadMore()}
      />
    </>
  )
}

function DiscoverVideos({
  videos,
  total,
  sourceId,
  loading,
  loadingMore,
  config,
  onSelect,
  onLoadMore,
}: {
  videos: KidVideo[]
  total: number
  sourceId: number
  loading: boolean
  loadingMore: boolean
  config: KidConfig
  onSelect: (v: KidVideo) => void
  onLoadMore: () => void
}): React.ReactElement {
  useAutoFocus(videos.length > 0, [sourceId])

  if (loading) return <Spinner label="Đang tải…" />

  if (videos.length === 0) {
    return (
      <EmptyState
        emoji="📺"
        title="Kênh này chưa có video"
        hint="Chọn kênh khác, hoặc bấm 🎲 Tất cả để xem mọi video."
      />
    )
  }

  return (
    <div className="pb-6">
      <Shelf
        color="#4ecdc4"
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

// ═══ Phan dung chung ════════════════════════════════════════════════

const CHANNEL_COLORS = ['#4ecdc4', '#a78bfa', '#ff9f43', '#5b9cff', '#f472b6', '#4ecb71']

function TopicBrowser({
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

    kidApi
      .shelves(profileId)
      .then((r) => {
        if (cancelled) return
        setTopics(r.shelves)
        setSelectedId(r.shelves[0]?.id ?? null)
        onQuotaRef.current(r.quota)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Không tải được danh sách')
      })

    return () => {
      cancelled = true
    }
  }, [profileId])

  // ─── Lay video cua chu de dang chon ──────────────────────────────
  const fetchPage = useCallback(
    (id: number, offset: number) => kidApi.shelf(id, profileId, offset, PAGE),
    [profileId],
  )

  /**
   * "The he" cua danh sach — tang moi khi doi ke.
   *
   * "Xem them" dang cho ma tre cham sang ke khac thi ket qua ve muon la cua
   * ke CU. Khong kiem tra the he thi no bi noi vao luoi cua ke moi: video sai
   * ke, va lan "Xem them" sau tinh offset sai. Tre hay bam lien tuc nen chuyen
   * nay de xay ra hon ta tuong.
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
      // Da doi ke trong luc cho -> day la ket qua cua ke cu, bo di.
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
    return (
      <EmptyState
        emoji="🧺"
        title="Chưa có video nào"
        hint={
          'Bố mẹ cần duyệt video rồi xếp vào kệ thì con mới xem được. ' +
          'Giữ icon ⚙ ở góc dưới bên phải 3 giây để vào trang bố mẹ.'
        }
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
        label="Chọn kệ video"
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
