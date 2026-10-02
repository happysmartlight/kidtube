import type { KidVideo } from '@/lib/api'
import { VideoCard } from './VideoCard'

interface ShelfProps {
  /**
   * Tieu de phia tren luoi. Bo trong khi phia tren da co hang nut chon chu de
   * — luc do nhac lai ten ke ngay duoi nut dang sang chi la nhieu voi tre.
   */
  title?: string
  emoji?: string
  color: string
  videos: KidVideo[]
  showDuration?: boolean
  showDownloadBadge?: boolean
  onSelect: (video: KidVideo) => void
}

/**
 * Luoi video.
 *
 * Truoc day day la hang CUON NGANG kieu Netflix. Da doi sang luoi cuon doc:
 * voi ke nhieu video, keo ngang mai khong het va tre khong nhin bao quat
 * duoc; luoi cho thay nhieu video hon trong mot lan nhin, va cuon doc la
 * thao tac tre quen tay nhat.
 */
export function Shelf({
  title,
  emoji,
  color,
  videos,
  showDuration,
  showDownloadBadge,
  onSelect,
}: ShelfProps): React.ReactElement {
  return (
    <section className="mb-4">
      {title ? (
        <h2
          className="kshelf-label mt-4 mb-3"
          style={{ paddingLeft: 'var(--safe-pad)', paddingRight: 'var(--safe-pad)', color }}
        >
          {emoji ? <span aria-hidden="true">{emoji}</span> : null}
          <span>{title}</span>
        </h2>
      ) : null}

      <div className="kgrid" role="list">
        {videos.map((v) => (
          <div role="listitem" key={v.id} className="contents">
            <VideoCard
              video={v}
              ringColor={color}
              showDuration={showDuration}
              showDownloadBadge={showDownloadBadge}
              onSelect={onSelect}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
