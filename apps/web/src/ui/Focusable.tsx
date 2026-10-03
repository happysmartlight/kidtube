import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { forwardRef } from 'react'
import { sfx, unlockAudio } from '@/lib/sfx'

interface FocusButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode
  /** Mau ring khi focus — dung mau cua ke de tre lien tuong duoc. */
  ringColor?: string
  /** Am thanh khi bam. */
  sound?: 'pop' | 'back' | 'none'
}

/**
 * Nut co the dieu huong bang D-pad.
 *
 * MOI thu bam duoc trong app phai dung component nay (hoac mang
 * `data-focusable` thu cong) — neu khong thi remote TV khong toi duoc,
 * va do la bay focus (xem DESIGN.md "Quy tac D-pad").
 */
export const FocusButton = forwardRef<HTMLButtonElement, FocusButtonProps>(
  function FocusButton({ children, ringColor, sound = 'pop', className = '', onClick, style, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        data-focusable
        data-ring={ringColor ? '' : undefined}
        className={`focusable ${className}`}
        style={ringColor ? ({ ...style, '--ring-color': ringColor } as React.CSSProperties) : style}
        onClick={(e) => {
          // AudioContext chi chay duoc sau tuong tac dau tien cua nguoi dung.
          unlockAudio()
          if (sound !== 'none') sfx[sound]()
          onClick?.(e)
        }}
        {...rest}
      >
        {children}
      </button>
    )
  },
)
