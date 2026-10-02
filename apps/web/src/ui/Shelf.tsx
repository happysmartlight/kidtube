import type { KidVideo } from '@/lib/api'
import { FocusButton } from './Focusable'
import { VideoCard } from './VideoCard'

interface ShelfProps {
  title: string
  emoji: string
  color: string
  videos: KidVideo[]
  showDuration?: boolean
  showDownloadBadge?: boolean
  onSelect: (video: KidVideo) => void
  /**
   * Tong so video thuc su co trong ke. Lon hon `videos.length` thi hien
   * o "Xem tat ca" o cuoi hang.
   */
  total?: number
  /** Bam "Xem tat ca". Khong truyen thi khong hien o do. */
  onSeeAll?: () => void
  /**
   * Hien dang LUOI cuon doc thay vi hang cuon ngang.
   * Dung cho trang "Xem tat ca" — hang ngang 1000 card thi tre khong bam toi.
   */
  grid?: boolean
}

export function Shelf({
  title,
  emoji,
  color,
  videos,
  showDuration,
  showDownloadBadge,
  onSelect,
  total,
  onSeeAll,
  grid = false,
}: ShelfProps): React.ReactElement {
  const hidden = total !== undefined ? total - videos.length : 0
  const showMore = !grid && onSeeAll !== undefined && hidden > 0

  return (
    <section className="mb-7">
      <h2
        className="kshelf-label mb-3"
        style={{ paddingLeft: 'var(--safe-pad)', paddingRight: 'var(--safe-pad)', color }}
      >
        <span aria-hidden="true">{emoji}</span>
        <span>{title}</span>
        {/* Dem tong — cho tre (va bo me) biet ke nay con nhieu nua */}
        {total !== undefined && total > videos.length ? (
          <span style={{ fontSize: '0.7em', opacity: 0.75, fontWeight: 700 }}>{total}</span>
        ) : null}
      </h2>

      {/* Cuon ngang. Khong dung nut mui tien: D-pad va cham tay deu cuon duoc,
          them nut chi lam nhieu vung bam cho tre. */}
      <div className={grid ? 'kgrid' : 'krow'} role="list">
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

        {showMore ? (
          <div role="listitem" className="contents">
            <FocusButton
              className="kcard kcard-more"
              ringColor={color}
              onClick={onSeeAll}
              aria-label={`Xem tất cả ${total} video trong ${title}`}
            >
              <span className="kcard-more-arrow" aria-hidden="true">
                ➡️
              </span>
              <span className="kcard-more-label" style={{ color }}>
                Xem tất cả
              </span>
              <span className="kcard-more-count">còn {hidden} video nữa</span>
            </FocusButton>
          </div>
        ) : null}
      </div>
    </section>
  )
}
