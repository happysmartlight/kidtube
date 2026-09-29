import type { KidVideo } from '@/lib/api'
import { VideoCard } from './VideoCard'

interface ShelfProps {
  title: string
  emoji: string
  color: string
  videos: KidVideo[]
  showDuration?: boolean
  showDownloadBadge?: boolean
  onSelect: (video: KidVideo) => void
}

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
    <section className="mb-7">
      <h2
        className="kshelf-label mb-3"
        style={{ paddingLeft: 'var(--safe-pad)', paddingRight: 'var(--safe-pad)', color }}
      >
        <span aria-hidden="true">{emoji}</span>
        <span>{title}</span>
      </h2>

      {/* Cuon ngang. Khong dung nut mui tien: D-pad va cham tay deu cuon duoc,
          them nut chi lam nhieu vung bam cho tre. */}
      <div className="krow" role="list">
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
