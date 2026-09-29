import { useEffect, useRef, useState } from 'react'
import { ApiError, type KidConfig, type KidShelf, type KidVideo, kidApi, type Quota } from '@/lib/api'
import { useAutoFocus } from '@/nav/spatial'
import { Shelf } from '@/ui/Shelf'
import { EmptyState, Spinner } from '@/ui/Spinner'

interface HomeProps {
  profileId: number
  config: KidConfig
  onSelect: (video: KidVideo) => void
  onQuota: (quota: Quota) => void
}

export function Home({ profileId, config, onSelect, onQuota }: HomeProps): React.ReactElement {
  const [shelves, setShelves] = useState<KidShelf[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * Giu callback trong ref thay vi de trong deps cua useEffect.
   *
   * Vi sao: `onQuota` goi setState o component cha, nen moi lan chay se sinh
   * mot identity MOI. Neu de no trong deps thi: effect chay -> onQuota ->
   * cha render lai -> onQuota moi -> effect chay lai -> VONG LAP VO HAN
   * goi /api/kid/home lien tuc (da tung xay ra, phat hien khi test bang browser).
   *
   * Ref lam component nay an toan ke ca khi ben goi quen boc useCallback.
   */
  const onQuotaRef = useRef(onQuota)
  useEffect(() => {
    onQuotaRef.current = onQuota
  }, [onQuota])

  useEffect(() => {
    let cancelled = false
    setShelves(null)
    setError(null)

    kidApi
      .home(profileId)
      .then((r) => {
        if (cancelled) return
        setShelves(r.shelves)
        onQuotaRef.current(r.quota)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Không tải được trang chủ')
      })

    return () => {
      cancelled = true
    }
  }, [profileId])

  if (error) return <EmptyState emoji="🔌" title="Có lỗi" hint={error} />
  if (!shelves) return <Spinner label="Đang tải…" />

  return <ShelfList shelves={shelves} config={config} onSelect={onSelect} />
}

function ShelfList({
  shelves,
  config,
  onSelect,
}: {
  shelves: KidShelf[]
  config: KidConfig
  onSelect: (v: KidVideo) => void
}): React.ReactElement {
  useAutoFocus(shelves.length > 0, [shelves.length])

  if (shelves.length === 0) {
    return (
      <EmptyState
        emoji="🧺"
        title="Chưa có video nào"
        hint={
          'Bố mẹ cần duyệt video rồi xếp vào kệ thì con mới xem được. ' +
          'Giữ icon ⚙ ở góc trên 3 giây để vào trang bố mẹ.'
        }
      />
    )
  }

  return (
    <div className="py-4">
      {shelves.map((s) => (
        <Shelf
          key={s.id}
          title={s.title}
          emoji={s.emoji}
          color={s.color}
          videos={s.videos}
          showDuration={config.showDuration}
          showDownloadBadge={config.showDownloadBadge}
          onSelect={onSelect}
        />
      ))}
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

// ═══ Kenh ═══════════════════════════════════════════════════════════

const CHANNEL_COLORS = ['#4ecdc4', '#a78bfa', '#ff9f43', '#5b9cff', '#f472b6', '#4ecb71']

export function Channels({
  profileId,
  config,
  onSelect,
}: {
  profileId: number
  config: KidConfig
  onSelect: (v: KidVideo) => void
}): React.ReactElement {
  const [channels, setChannels] = useState<Awaited<
    ReturnType<typeof kidApi.channels>
  >['channels'] | null>(null)

  useEffect(() => {
    let cancelled = false
    setChannels(null)
    kidApi
      .channels(profileId)
      .then((r) => {
        if (!cancelled) setChannels(r.channels)
      })
      .catch(() => {
        if (!cancelled) setChannels([])
      })
    return () => {
      cancelled = true
    }
  }, [profileId])

  if (!channels) return <Spinner label="Đang tải…" />

  if (channels.length === 0) {
    return (
      <EmptyState
        emoji="📺"
        title="Chưa có kênh nào"
        hint="Bố mẹ thêm kênh trong trang quản lý thì các kênh sẽ hiện ở đây."
      />
    )
  }

  return (
    <div className="py-4">
      {channels.map((c, i) => (
        <Shelf
          key={c.id}
          title={c.title.toUpperCase()}
          emoji="📺"
          color={CHANNEL_COLORS[i % CHANNEL_COLORS.length] ?? '#4ecdc4'}
          videos={c.videos}
          showDuration={config.showDuration}
          showDownloadBadge={config.showDownloadBadge}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
