import { useCallback, useEffect, useRef, useState } from 'react'
import { adminApi, ApiError } from '@/lib/api'
import { sfx } from '@/lib/sfx'
import { FocusButton } from './Focusable'

/**
 * PARENT GATE — hai lop chan:
 *   1. Long-press icon ⚙ trong 3 giay (tre nho khong kien nhan/khong biet lam)
 *   2. Nhap PIN
 *
 * Co y KHONG dung "phep tinh" lam cong chan nhu mot so app khac:
 * tre 6-7 tuoi giai duoc 7x8, con PIN thi khong doan duoc.
 * Long-press moi la phan "an", PIN la phan "khoa".
 *
 * Bo me co the tat lop PIN (Cai dat → PIN cua bo me). Khi do long-press xong
 * la vao thang — App.openParentGate hoi server truoc khi mo PinDialog.
 */

const HOLD_MS = 3000

interface LongPressResult {
  progress: number
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void
    onPointerUp: () => void
    onPointerLeave: () => void
    onKeyDown: (e: React.KeyboardEvent) => void
    onKeyUp: (e: React.KeyboardEvent) => void
  }
}

/**
 * Giu de kich hoat. Ho tro CA cham tay (pointer) va remote TV (giu Enter) —
 * thieu mot trong hai la mot nen tang khong vao duoc admin.
 */
function useLongPress(onComplete: () => void): LongPressResult {
  const [progress, setProgress] = useState(0)
  const startRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const doneRef = useRef(false)

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    startRef.current = null
    doneRef.current = false
    setProgress(0)
  }, [])

  const start = useCallback(() => {
    if (startRef.current !== null) return
    startRef.current = performance.now()
    doneRef.current = false

    const step = (): void => {
      if (startRef.current === null) return
      const elapsed = performance.now() - startRef.current
      const p = Math.min(1, elapsed / HOLD_MS)
      setProgress(p)
      if (p >= 1) {
        if (!doneRef.current) {
          doneRef.current = true
          sfx.pop()
          onComplete()
        }
        stop()
        return
      }
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
  }, [onComplete, stop])

  useEffect(() => stop, [stop])

  return {
    progress,
    handlers: {
      onPointerDown: (e) => {
        e.preventDefault()
        start()
      },
      onPointerUp: stop,
      onPointerLeave: stop,
      onKeyDown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          start()
        }
      },
      onKeyUp: (e) => {
        if (e.key === 'Enter' || e.key === ' ') stop()
      },
    },
  }
}

/** Icon ⚙ mo, phai giu 3 giay. Dat o header trang cua tre. */
export function ParentGateButton({ onOpen }: { onOpen: () => void }): React.ReactElement {
  const { progress, handlers } = useLongPress(onOpen)

  return (
    <button
      type="button"
      data-focusable
      className="focusable relative grid place-items-center rounded-full"
      style={{
        // Mac dinh bang --tap. Thanh duoi dat lai --gate-size tren man hinh
        // hep de nut khong day dong ho va cac nut chinh ra ngoai.
        width: 'var(--gate-size, var(--tap))',
        height: 'var(--gate-size, var(--tap))',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        // Mo di de tre khong to mo — nhung khong an hoan toan, bo me phai thay.
        opacity: progress > 0 ? 1 : 0.35,
      }}
      aria-label="Dành cho bố mẹ — giữ 3 giây"
      title="Giữ 3 giây để vào trang bố mẹ"
      {...handlers}
    >
      <span style={{ fontSize: 'calc(var(--gate-size, var(--tap)) * 0.42)' }} aria-hidden="true">
        ⚙
      </span>

      {/* Vong tron tien do khi dang giu — phan hoi ro rang cho bo me biet
          la dang co tac dung, khong phai nut hong. */}
      {progress > 0 ? (
        <svg
          className="pointer-events-none absolute inset-0"
          viewBox="0 0 100 100"
          aria-hidden="true"
        >
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="var(--focus)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${progress * 276.5} 276.5`}
            transform="rotate(-90 50 50)"
          />
        </svg>
      ) : null}
    </button>
  )
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'del']

export function PinDialog({
  onSuccess,
  onCancel,
}: {
  onSuccess: (pinIsDefault: boolean) => void
  onCancel: () => void
}): React.ReactElement {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = useCallback(
    async (value: string) => {
      setBusy(true)
      setError(null)
      try {
        const res = await adminApi.login(value)
        sfx.pop()
        onSuccess(res.pinIsDefault)
      } catch (err) {
        sfx.nope()
        setPin('')
        setError(err instanceof ApiError ? err.message : 'Không đăng nhập được')
      } finally {
        setBusy(false)
      }
    },
    [onSuccess],
  )

  const press = useCallback(
    (key: string) => {
      setError(null)
      if (key === 'del') {
        setPin((p) => p.slice(0, -1))
        return
      }
      if (key === 'clear') {
        setPin('')
        return
      }
      setPin((p) => {
        const next = (p + key).slice(0, 12)
        return next
      })
    },
    [],
  )

  // Cho phep go bang ban phim that — bo me dung laptop se thich hon ban phim so.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (/^\d$/.test(e.key)) {
        e.stopPropagation()
        press(e.key)
      } else if (e.key === 'Backspace') {
        e.stopPropagation()
        press('del')
      } else if (e.key === 'Enter' && pin.length >= 4) {
        e.stopPropagation()
        void submit(pin)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [press, pin, submit])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-6"
      style={{ background: 'var(--scrim)', backdropFilter: 'blur(6px)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Nhập PIN của bố mẹ"
    >
      <div
        className="anim-pop w-full max-w-sm rounded-3xl p-6"
        style={{ background: 'var(--bg-elev)' }}
      >
        <h2 className="mb-1 text-center text-2xl font-extrabold">Trang của bố mẹ</h2>
        <p className="mb-5 text-center text-sm" style={{ color: 'var(--text-dim)' }}>
          Nhập PIN để tiếp tục
        </p>

        {/* O hien thi PIN dang dau cham — khong hien so that */}
        <div className="mb-4 flex items-center justify-center gap-2.5" aria-hidden="true">
          {Array.from({ length: Math.max(6, pin.length) }).map((_, i) => (
            <span
              key={i}
              className="rounded-full transition-all"
              style={{
                width: 14,
                height: 14,
                background: i < pin.length ? 'var(--focus)' : 'var(--card-hi)',
              }}
            />
          ))}
        </div>

        {error ? (
          <p
            className="mb-4 rounded-xl px-3 py-2 text-center text-sm font-bold"
            style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <div className="mb-4 grid grid-cols-3 gap-2.5">
          {KEYS.map((k) => (
            <FocusButton
              key={k}
              className="kbtn"
              style={{ height: 60, padding: 0, fontSize: 22 }}
              onClick={() => press(k)}
              sound="none"
              aria-label={k === 'del' ? 'Xoá một số' : k === 'clear' ? 'Xoá hết' : k}
            >
              {k === 'del' ? '⌫' : k === 'clear' ? '✕' : k}
            </FocusButton>
          ))}
        </div>

        <div className="flex gap-2.5">
          <FocusButton className="kbtn kbtn-ghost flex-1" onClick={onCancel} sound="back">
            Thoát
          </FocusButton>
          <FocusButton
            className="kbtn kbtn-primary flex-1"
            disabled={pin.length < 4 || busy}
            style={{ opacity: pin.length < 4 || busy ? 0.45 : 1 }}
            onClick={() => void submit(pin)}
          >
            {busy ? 'Đang kiểm tra…' : 'Vào'}
          </FocusButton>
        </div>
      </div>
    </div>
  )
}
