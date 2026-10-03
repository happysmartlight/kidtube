import type { KidVideo } from '@/lib/api'
import { VideoCard } from './VideoCard'

interface ShelfProps {
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
 *
 * Khong co tieu de: phia tren luoi luon co hang nut chon chu de, nhac lai ten
 * ke ngay duoi nut dang sang chi la nhieu voi tre.
 */
export function Shelf({
  color,
  videos,
  showDuration,
  showDownloadBadge,
  onSelect,
}: ShelfProps): React.ReactElement {
  return (
    <section className="mb-4">
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
