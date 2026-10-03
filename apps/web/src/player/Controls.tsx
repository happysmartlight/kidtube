import type { PlayerState } from './PlayerAdapter'
import { formatDuration } from '@/lib/format'
import { FocusButton } from '@/ui/Focusable'

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
}: ControlsProps): React.ReactElement {
  const pct = state.duration > 0 ? (state.time / state.duration) * 100 : 0

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-20 transition-opacity duration-300"
      style={{
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        paddingLeft: 'var(--safe-pad)',
        paddingRight: 'var(--safe-pad)',
        paddingBottom: 'max(var(--safe-pad), env(safe-area-inset-bottom))',
        background: 'linear-gradient(to top, rgba(8,6,14,0.96) 10%, rgba(8,6,14,0) 100%)',
        paddingTop: 72,
      }}
      // Khi an, khong cho remote focus vao — tranh bay focus vo hinh.
      aria-hidden={!visible}
    >
      <h1
        className="mb-3 truncate font-extrabold"
        style={{ fontSize: 'var(--font-title)', color: 'var(--text)' }}
      >
        {title}
      </h1>

      {/* Thanh tien do. Vung bam cao 28px du de tre cham chinh xac. */}
      <div
        className="mb-4 flex cursor-pointer items-center"
        style={{ height: 28 }}
        onPointerDown={(e) => {
          if (state.duration <= 0) return
          const rect = e.currentTarget.getBoundingClientRect()
          const ratio = (e.clientX - rect.left) / rect.width
          onSeekTo(Math.max(0, Math.min(1, ratio)) * state.duration)
        }}
      >
        <div
          className="relative w-full overflow-hidden rounded-full"
          style={{ height: 10, background: 'rgba(255,255,255,0.22)' }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${pct}%`, background: 'var(--focus)' }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <CtrlButton label="Về trang chủ" onClick={onHome} sound="back">
            🏠
          </CtrlButton>
          <CtrlButton label="Lùi 10 giây" onClick={() => onSeekBy(-10)} sound="none">
            ⏪
          </CtrlButton>
          <CtrlButton
            label={state.playing ? 'Tạm dừng' : 'Phát'}
            onClick={onToggle}
            big
            sound="none"
          >
            {state.playing ? '⏸' : '▶️'}
          </CtrlButton>
          <CtrlButton label="Tiến 10 giây" onClick={() => onSeekBy(10)} sound="none">
            ⏩
          </CtrlButton>
          {hasNext ? (
            <CtrlButton label="Video tiếp theo" onClick={onNext}>
              ⏭
            </CtrlButton>
          ) : null}
        </div>

        <div className="flex items-center gap-2.5">
          <span
            className="tabular-nums"
            style={{ fontSize: 'calc(var(--font-title) * 0.95)', color: 'var(--text-dim)' }}
          >
            {formatDuration(state.time)} / {formatDuration(state.duration)}
          </span>

          <CtrlButton
            label={state.muted || state.volume === 0 ? 'Bật tiếng' : 'Tắt tiếng'}
            onClick={() => onVolume(state.muted || state.volume === 0 ? 1 : 0)}
            sound="none"
          >
            {state.muted || state.volume === 0 ? '🔇' : '🔊'}
          </CtrlButton>
        </div>
      </div>
    </div>
  )
}

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
  const size = big ? 'calc(var(--ctrl-btn) * 1.4)' : 'var(--ctrl-btn)'
  return (
    <FocusButton
      onClick={onClick}
      aria-label={label}
      title={label}
      sound={sound}
      className="grid place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        fontSize: `calc(${size} * 0.44)`,
        background: big ? 'var(--focus)' : 'rgba(255,255,255,0.14)',
        border: 'none',
        cursor: 'pointer',
        lineHeight: 1,
      }}
    >
      <span aria-hidden="true">{children}</span>
    </FocusButton>
  )
}
