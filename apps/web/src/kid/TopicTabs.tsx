import { useEffect, useRef } from 'react'
import { FocusButton } from '@/ui/Focusable'

export interface Topic {
  id: number
  title: string
  emoji: string
  color: string
  total: number
}

interface TopicTabsProps {
  topics: Topic[]
  selectedId: number | null
  onSelect: (id: number) => void
  /** Doc cho trinh doc man hinh, vi du "Chọn kệ" / "Chọn kênh". */
  label: string
  /**
   * Nut ghim o ben TRAI, khong cuon theo cac nut chu de.
   *
   * Dung cho nut "Làm mới" cua tab Khám phá: dat o day thi no luon nhin thay
   * duoc va KHONG ton them mot hang ngang nao — chieu cao man hinh vua moi
   * phai danh cho luoi video.
   */
  leading?: React.ReactNode
}

/**
 * Hang nut chon chu de, nam yen tren dau luoi video (luoi cuon ben duoi —
 * xem KidPage trong KidShell.tsx).
 *
 * Vi sao can: truoc day trang chu xep cac ke chong len nhau theo chieu doc.
 * Ke dau co nhieu video thi tre phai cuon rat lau moi biet ben duoi con ke
 * nao — thuc te la khong bao gio biet. Hang nut nay LUON hien, nen moi chu de
 * deu cach mot cu cham.
 *
 * Nut phai TO: tre bam khong chinh xac bang nguoi lon. Chieu cao toi thieu
 * dung --tap (72px tablet / 88px TV) giong moi vung bam khac trong app.
 */
export function TopicTabs({
  topics,
  selectedId,
  onSelect,
  label,
  leading,
}: TopicTabsProps): React.ReactElement {
  const barRef = useRef<HTMLDivElement>(null)

  // Keo nut dang chon vao tam nhin — khi co nhieu chu de, nut dang chon
  // co the nam ngoai man hinh sau khi tre quay lai trang.
  useEffect(() => {
    const el = barRef.current?.querySelector<HTMLElement>('[data-selected="1"]')
    if (!el) return
    try {
      el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
    } catch {
      /* Trinh duyet TV cu khong nhan doi tuong tuy chon — bo qua. */
    }
  }, [selectedId])

  return (
    <div className="ktabs-wrap">
      {leading ? <div className="ktabs-leading">{leading}</div> : null}

      <div className="ktabs" ref={barRef} role="tablist" aria-label={label}>
        {topics.map((t) => {
          const on = t.id === selectedId
          return (
            <FocusButton
              key={t.id}
              className="ktab"
              // Nut dang chon to bang mau cua ke -> vong focus cung mau se tan
              // vao nen, tren TV chi thay nut to ra ma khong thay vong. Dung
              // mau chu (trang) cho nut dang chon de vong luon noi len.
              ringColor={on ? 'var(--text)' : t.color}
              role="tab"
              aria-selected={on}
              data-selected={on ? '1' : undefined}
              onClick={() => onSelect(t.id)}
              style={
                on
                  ? { background: t.color, color: '#111111' }
                  : { background: 'var(--card)', color: 'var(--text)' }
              }
            >
              <span className="ktab-emoji" aria-hidden="true">
                {t.emoji}
              </span>
              <span className="ktab-title">{t.title}</span>
              <span
                className="ktab-count"
                // Doc thanh "12 video" thay vi chi "12" — ro nghia hon khi nghe.
                aria-label={`${t.total} video`}
                style={on ? { background: 'rgba(0,0,0,0.18)' } : undefined}
              >
                {t.total}
              </span>
            </FocusButton>
          )
        })}
      </div>
    </div>
  )
}
