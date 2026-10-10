import { useCallback, useEffect, useState } from 'react'
import { useBackHandler } from '@/lib/back'
import { C, withAlpha } from '@/lib/color'

/**
 * Primitive cho trang quan tri.
 *
 * Giao dien nay danh cho BO ME, khong phai tre: mat do thong tin day hon,
 * chu nho hon, va KHONG can dieu huong bang D-pad (bo me dung tablet/laptop).
 * Nen o day dung <button> thuong, khong dung FocusButton.
 */

/**
 * Mot muc trong trang. Nen BAN TRONG SUOT tren nen chuyen mau (giong giao
 * dien cua be), co bieu tuong o dau tieu de de liec qua la biet muc nao.
 */
export function Panel({
  title,
  subtitle,
  icon,
  actions,
  children,
}: {
  title?: string
  subtitle?: string
  icon?: string
  actions?: React.ReactNode
  children: React.ReactNode
}): React.ReactElement {
  return (
    <section
      className="mb-5 rounded-2xl"
      style={{ background: 'var(--panel)', border: '1px solid var(--panel-border)' }}
    >
      {title || actions ? (
        <header
          className="flex flex-wrap items-center gap-3 px-5 py-4"
          style={{ borderBottom: '1px solid var(--panel-border)' }}
        >
          {/* Bieu tuong + chu di lien nhau; man hep thi CA khoi nut xuong hang */}
          <div className="flex min-w-0 flex-1 items-center gap-3" style={{ flexBasis: 240 }}>
            {icon ? (
              <span
                className="grid shrink-0 place-items-center rounded-xl"
                style={{ width: 38, height: 38, fontSize: 19, background: 'var(--card)' }}
                aria-hidden="true"
              >
                {icon}
              </span>
            ) : null}
            <div className="min-w-0">
              {title ? (
                <h2 className="text-lg font-extrabold" style={{ lineHeight: 1.3 }}>
                  {title}
                </h2>
              ) : null}
              {subtitle ? (
                <p className="mt-0.5 text-sm" style={{ color: 'var(--text-dim)', lineHeight: 1.45 }}>
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  )
}

type BtnVariant = 'primary' | 'ghost' | 'danger' | 'ok'

export function Btn({
  children,
  variant = 'ghost',
  small = false,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant
  small?: boolean
}): React.ReactElement {
  const styles: Record<BtnVariant, React.CSSProperties> = {
    primary: { background: 'var(--focus)', color: 'var(--focus-ink)' },
    ghost: {
      background: 'var(--card)',
      color: 'var(--text)',
      border: '1px solid var(--card-hi)',
    },
    danger: {
      background: 'var(--danger-bg)',
      color: 'var(--danger)',
      border: '1px solid var(--danger-border)',
    },
    ok: {
      background: 'var(--ok-bg)',
      color: 'var(--ok)',
      border: '1px solid var(--ok-border)',
    },
  }

  return (
    <button
      type="button"
      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
      style={{
        ...styles[variant],
        padding: small ? '6px 12px' : '10px 18px',
        fontSize: small ? 13 : 15,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-sm font-bold">{label}</span>
      {children}
      {hint ? (
        <span className="mt-1.5 block text-xs" style={{ color: 'var(--text-dim)', lineHeight: 1.5 }}>
          {hint}
        </span>
      ) : null}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--card-hi)',
  borderRadius: 12,
  color: 'var(--text)',
  padding: '10px 14px',
  fontFamily: 'inherit',
  fontSize: 15,
  fontWeight: 600,
  width: '100%',
  outline: 'none',
}

/** `ComponentProps` thay vi `InputHTMLAttributes` de nhan `ref` (React 19: ref la prop). */
export function Input(props: React.ComponentProps<'input'>): React.ReactElement {
  return <input {...props} style={{ ...inputStyle, ...props.style }} />
}

export function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement>,
): React.ReactElement {
  return <select {...props} style={{ ...inputStyle, ...props.style }} />
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}): React.ReactElement {
  return (
    <label
      className="mb-3 flex cursor-pointer items-start gap-3"
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative shrink-0 rounded-full transition-colors"
        style={{
          width: 48,
          height: 28,
          background: checked ? 'var(--ok)' : 'var(--card-hi)',
          border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          marginTop: 2,
        }}
      >
        <span
          className="absolute rounded-full transition-all"
          style={{
            width: 22,
            height: 22,
            top: 3,
            left: checked ? 23 : 3,
            background: '#fff',
          }}
        />
      </button>
      <span>
        <span className="block text-sm font-bold">{label}</span>
        {hint ? (
          <span className="block text-xs" style={{ color: 'var(--text-dim)', lineHeight: 1.5 }}>
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  )
}

export function Badge({
  children,
  color = C.dim,
}: {
  children: React.ReactNode
  /** PHAI la hex (`#rrggbb`), khong dung `var(--x)` — xem chu thich trong lib/color.ts. */
  color?: string
}): React.ReactElement {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-bold"
      style={{
        background: withAlpha(color, 0.18),
        color,
        border: `1px solid ${withAlpha(color, 0.35)}`,
      }}
    >
      {children}
    </span>
  )
}

export function Alert({
  kind = 'info',
  children,
}: {
  kind?: 'info' | 'warn' | 'error' | 'ok'
  children: React.ReactNode
}): React.ReactElement {
  const colors = { info: C.dim, warn: C.warn, error: C.danger, ok: C.ok }
  const icons = { info: 'ℹ️', warn: '⚠️', error: '❌', ok: '✅' }
  const c = colors[kind]

  return (
    <div
      className="mb-4 flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm"
      style={{
        background: withAlpha(c, 0.12),
        border: `1px solid ${withAlpha(c, 0.32)}`,
        color: kind === 'info' ? 'var(--text)' : c,
        lineHeight: 1.55,
      }}
      role={kind === 'error' ? 'alert' : undefined}
    >
      <span aria-hidden="true">{icons[kind]}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

// ─── Hop thoai ────────────────────────────────────────────────────────

/**
 * Hop thoai giua man hinh — thay cho `window.confirm`: hop cua trinh duyet
 * khong dinh dang duoc, chu dinh mot cuc, va lac long han voi giao dien.
 *
 * Esc / bam ra ngoai = dong, TRU khi `locked` (dang gui yeu cau — dong luc do
 * thi bo me khong biet ket qua ra sao).
 *
 * Cuon ca lop phu chu khong gioi han chieu cao the bang `dvh`: TV LG cu
 * khong hieu `dvh`, va can giua bang flex + min-h-full thi noi dung dai
 * khong bi cat mat phan dau.
 */
export function Dialog({
  title,
  subtitle,
  icon,
  /** PHAI la hex — xem chu thich cua Badge. */
  iconColor = C.info,
  locked = false,
  onClose,
  footer,
  children,
}: {
  title: string
  subtitle?: React.ReactNode
  icon?: string
  iconColor?: string
  locked?: boolean
  onClose: () => void
  footer: React.ReactNode
  children?: React.ReactNode
}): React.ReactElement {
  // Hop thoai nam TREN tang "ve trang cua be" cua App (lib/back.ts): Esc /
  // Back cua remote chi dong hop, khong da bo me ra khoi trang quan tri.
  useBackHandler(() => {
    if (!locked) onClose()
  })

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: 'var(--scrim)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="flex min-h-full items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget && !locked) onClose()
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="anim-pop w-full max-w-md rounded-2xl"
          style={{
            background: 'var(--bg-elev)',
            border: '1px solid var(--card-hi)',
            boxShadow: '0 24px 64px rgba(0, 0, 0, 0.45)',
          }}
        >
          <header className="flex items-start gap-3 px-5 pt-5 pb-4">
            {icon ? (
              <span
                className="grid shrink-0 place-items-center rounded-xl"
                style={{
                  width: 44,
                  height: 44,
                  fontSize: 22,
                  background: withAlpha(iconColor, 0.16),
                  border: `1px solid ${withAlpha(iconColor, 0.35)}`,
                }}
                aria-hidden="true"
              >
                {icon}
              </span>
            ) : null}
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 className="text-lg font-extrabold" style={{ lineHeight: 1.3 }}>
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-0.5 text-sm" style={{ color: 'var(--text-dim)' }}>
                  {subtitle}
                </p>
              ) : null}
            </div>
          </header>

          {children ? <div className="px-5">{children}</div> : null}

          <footer
            className="flex flex-wrap justify-end gap-2 px-5 py-4"
            style={{ borderTop: '1px solid var(--card)' }}
          >
            {footer}
          </footer>
        </div>
      </div>
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────

export interface ToastMessage {
  id: number
  kind: 'ok' | 'error' | 'info'
  text: string
}

let toastSeq = 0
const toastListeners = new Set<(t: ToastMessage) => void>()

export function toast(kind: ToastMessage['kind'], text: string): void {
  const msg = { id: ++toastSeq, kind, text }
  for (const fn of toastListeners) fn(msg)
}

export function ToastHost(): React.ReactElement {
  const [items, setItems] = useState<ToastMessage[]>([])

  useEffect(() => {
    const add = (t: ToastMessage): void => {
      setItems((prev) => [...prev, t])
      window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== t.id))
      }, 4500)
    }
    toastListeners.add(add)
    return () => {
      toastListeners.delete(add)
    }
  }, [])

  return (
    <div
      className="pointer-events-none fixed right-4 bottom-4 z-[100] flex flex-col gap-2"
      aria-live="polite"
    >
      {items.map((t) => {
        const c = t.kind === 'ok' ? C.ok : t.kind === 'error' ? C.danger : C.info
        return (
          <div
            key={t.id}
            className="anim-pop max-w-sm rounded-xl px-4 py-3 text-sm font-bold shadow-lg"
            style={{
              background: 'var(--bg-elev)',
              border: `1px solid ${withAlpha(c, 0.45)}`,
              color: c,
            }}
          >
            {t.text}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Hook tai du lieu: xu ly loading / error / reload trong mot cho.
 * Tranh viec moi tab tu viet lai cung mot mau useEffect.
 */
export function useLoad<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
): {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
} {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    loader()
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Lỗi không rõ')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps])

  return { data, loading, error, reload }
}
