export function Spinner({ label }: { label?: string }): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16" role="status">
      <div
        className="anim-spin rounded-full"
        style={{
          width: 56,
          height: 56,
          border: '6px solid var(--card-hi)',
          borderTopColor: 'var(--focus)',
        }}
      />
      {label ? <p style={{ color: 'var(--text-dim)' }}>{label}</p> : null}
    </div>
  )
}

/** Trang thai rong — luon noi RO PHAI LAM GI, khong chi "khong co gi". */
export function EmptyState({
  emoji,
  title,
  hint,
  children,
}: {
  emoji: string
  title: string
  hint?: string
  children?: React.ReactNode
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div style={{ fontSize: 64 }} aria-hidden="true">
        {emoji}
      </div>
      <h2 className="text-2xl font-extrabold">{title}</h2>
      {hint ? (
        <p style={{ color: 'var(--text-dim)', maxWidth: 420, lineHeight: 1.5 }}>{hint}</p>
      ) : null}
      {children}
    </div>
  )
}
