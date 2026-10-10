import type { PlayerState } from './PlayerAdapter'
import type { KidVideo } from '@/lib/api'
import { formatDuration } from '@/lib/format'
import { FocusButton } from '@/ui/Focusable'
import { VideoCard } from '@/ui/VideoCard'
import { IconHome, IconNext, IconPause, IconPlay, IconSeek10, IconVolume } from './icons'

interface ControlsProps {
  state: PlayerState
  visible: boolean
  title: string
  hasNext: boolean
  onHome: () => void
  onToggle: () => void
  onSeekBy: (delta: number) => void
  onSeekTo: (seconds: number) => void
  onVolume: (v: number) => void
  onNext: () => void
  /** Hang "Video khác" duoi cac nut. Rong thi khong ve. */
  related: KidVideo[]
  showDuration: boolean
  showDownloadBadge: boolean
  onPick: (video: KidVideo) => void
  /** Be dang cham / cuon / chon trong thanh dieu khien — dung an no di. */
  onActivity: () => void
}

/**
 * Thanh dieu khien TU VIET, dung chung cho ca stream YouTube va file local.
 *
 * Vi sao khong dung controls cua YouTube/trinh duyet:
 *   - controls cua YouTube co logo dan ra youtube.com va menu "Xem sau"
 *   - controls cua <video> co nut tai xuong va menu chuot phai
 *   - nut cua ca hai deu qua nho cho tay tre va khong dieu huong duoc bang D-pad
 */
export function Controls({
  state,
  visible,
  title,
  hasNext,
  onHome,
  onToggle,
  onSeekBy,
  onSeekTo,
  onVolume,
  onNext,
  related,
  showDuration,
  showDownloadBadge,
  onPick,
  onActivity,
}: ControlsProps): React.ReactElement {
  const pct = state.duration > 0 ? (state.time / state.duration) * 100 : 0

  return (
    <div
      // Khoang cach (dem tren, tieu de, thanh tua) nam trong .kplayer o
      // index.css — dien thoai xoay ngang thu gon lai bang @media.
      className="kplayer absolute inset-x-0 bottom-0 z-20 transition-opacity duration-300"
      style={{
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        paddingLeft: 'var(--safe-pad)',
        paddingRight: 'var(--safe-pad)',
        paddingBottom: 'max(var(--safe-pad), env(safe-area-inset-bottom))',
        // Co luoi "Video khác" thi toi sau hon: tieu de card mau trang phai doc
        // duoc ca khi canh video phia sau sang.
        background:
          related.length > 0
            ? 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.85) 55%, rgba(0,0,0,0) 100%)'
            : 'linear-gradient(to top, rgba(0,0,0,0.92) 10%, rgba(0,0,0,0) 100%)',
      }}
      // Khi an, khong cho remote focus vao — tranh bay focus vo hinh.
      aria-hidden={!visible}
      // Be dang luot tim video trong hang "Video khác" thi dung an thanh
      // dieu khien giua chung.
      onPointerDown={onActivity}
      onFocus={onActivity}
    >
      <h1 className="kplayer-title truncate font-extrabold" style={{ color: 'var(--text)' }}>
        {title}
      </h1>

      {/*
        Thoi gian kep hai dau thanh tua (kieu YouTube / Spotify): 0:44 ━━●── 1:23:07.
        Truoc day thoi gian nam trong hang nut, nen man doc dien thoai khong du
        cho va phai xep nut thanh HAI hang. Vung bam cua thanh tua cao 28px du
        de tre cham chinh xac; vach hien thi thi mong cho gon.
      */}
      <div className="kplayer-seekrow">
        <span className="kplayer-time">{formatDuration(state.time)}</span>
        <div
          className="kplayer-seek"
          onPointerDown={(e) => {
            if (state.duration <= 0) return
            const rect = e.currentTarget.getBoundingClientRect()
            const ratio = (e.clientX - rect.left) / rect.width
            onSeekTo(Math.max(0, Math.min(1, ratio)) * state.duration)
          }}
        >
          <div className="kplayer-track">
            <div className="kplayer-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="kplayer-thumb" style={{ left: `${pct}%` }} />
        </div>
        <span className="kplayer-time">{formatDuration(state.duration)}</span>
      </div>

      {/*
        MOT hang o moi kich thuoc man hinh (.kctrl trong index.css):
          [🏠]           [⏪] [ ⏯ ] [⏩] [⏭]           [🔊]
        Cum phat dung GIUA (luoi 3 cot 1fr auto 1fr), 🏠 sat trai, 🔊 sat phai.
        Thu tu DOM giu nguyen cho D-pad.
      */}
      <div className="kctrl">
        <div className="kctrl-home">
          <CtrlButton label="Về trang chủ" onClick={onHome} sound="back">
            <IconHome />
          </CtrlButton>
        </div>

        <div className="kctrl-transport">
          <CtrlButton label="Lùi 10 giây" onClick={() => onSeekBy(-10)} sound="none">
            <IconSeek10 back className="kicon-lg" />
          </CtrlButton>
          <CtrlButton
            label={state.playing ? 'Tạm dừng' : 'Phát'}
            onClick={onToggle}
            big
            sound="none"
          >
            {state.playing ? <IconPause /> : <IconPlay />}
          </CtrlButton>
          <CtrlButton label="Tiến 10 giây" onClick={() => onSeekBy(10)} sound="none">
            <IconSeek10 className="kicon-lg" />
          </CtrlButton>
          {hasNext ? (
            <CtrlButton label="Video tiếp theo" onClick={onNext}>
              <IconNext />
            </CtrlButton>
          ) : null}
        </div>

        <div className="kctrl-vol">
          <CtrlButton
            label={state.muted || state.volume === 0 ? 'Bật tiếng' : 'Tắt tiếng'}
            onClick={() => onVolume(state.muted || state.volume === 0 ? 1 : 0)}
            sound="none"
          >
            <IconVolume muted={state.muted || state.volume === 0} />
          </CtrlButton>
        </div>
      </div>

      {/*
        "Video khác" — nhu YouTube: cham man hinh hien nut dieu khien thi hien
        luon luoi video de be chon tiep tai cho, khong phai quay ra trang chu.
        Luoi tu xuong hang, vuot len/xuong (hoac lan chuot) de xem them.
        `data-upnext`: Watch.tsx dua vao day de mui ten cua remote di giua cac
        video thay vi tua.
      */}
      {related.length > 0 ? (
        <div className="kupnext" data-upnext onScroll={onActivity}>
          {related.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              showDuration={showDuration}
              showDownloadBadge={showDownloadBadge}
              onSelect={onPick}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Nut tron cua trinh phat. Hinh dang do CSS quyet (.kpbtn trong index.css):
 * nen kinh mo + icon trang; nut phat (`big`) nen do, to hon theo --ctrl-big.
 */
function CtrlButton({
  children,
  label,
  onClick,
  big = false,
  sound = 'pop',
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  big?: boolean
  sound?: 'pop' | 'back' | 'none'
}): React.ReactElement {
  return (
    <FocusButton
      onClick={onClick}
      aria-label={label}
      title={label}
      sound={sound}
      className={big ? 'kpbtn kpbtn-primary' : 'kpbtn'}
    >
      {children}
    </FocusButton>
  )
}
