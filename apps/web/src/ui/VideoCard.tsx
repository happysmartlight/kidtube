import type { KidVideo } from '@/lib/api'
import { formatDuration } from '@/lib/format'
import { FocusButton } from './Focusable'

interface VideoCardProps {
  video: KidVideo
  ringColor?: string
  showDuration?: boolean
  showDownloadBadge?: boolean
  onSelect: (video: KidVideo) => void
}

export function VideoCard({
  video,
  ringColor,
  showDuration = true,
  showDownloadBadge = true,
  onSelect,
}: VideoCardProps): React.ReactElement {
  return (
    <FocusButton
      className="kcard"
      ringColor={ringColor}
      onClick={() => onSelect(video)}
      aria-label={`Xem: ${video.title}`}
    >
      <div className="kcard-thumb">
        {video.thumbnail ? (
          <img
            src={video.thumbnail}
            alt=""
            loading="lazy"
            decoding="async"
            // Thumbnail cua YouTube doi khi 404 (video bi xoa). Thay bang
            // o mau thay vi de icon anh vo — tre khong hieu icon vo la gi.
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : null}

        {/* Huy hieu goc tren-phai */}
        <div className="absolute top-2 right-2 flex gap-1.5">
          {showDownloadBadge && video.hasLocal ? (
            <span
              className="rounded-full bg-black/65 px-2 py-1 text-base leading-none backdrop-blur-sm"
              aria-label="Đã tải về máy"
              title="Đã tải về — xem được cả khi mất mạng, không có quảng cáo"
            >
              ⬇
            </span>
          ) : null}
        </div>

        {/* Thoi luong goc duoi-phai */}
        {showDuration && video.durationSec ? (
          <span className="absolute right-2 bottom-2 rounded-lg bg-black/75 px-2 py-0.5 text-sm font-bold tabular-nums backdrop-blur-sm">
            {formatDuration(video.durationSec)}
          </span>
        ) : null}
      </div>

      {/* Mot dong, cat bang "…" — re chuot (bo me tren may tinh) thi hien du. */}
      <div className="kcard-title" title={video.title}>
        {video.title}
      </div>
    </FocusButton>
  )
}
