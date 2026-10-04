import { useRef, useState } from 'react'
import { adminApi, ApiError } from '@/lib/api'
import { C } from '@/lib/color'
import { Spinner } from '@/ui/Spinner'
import { Alert, Btn, Dialog, Field, Input, useLoad } from './ui'

/**
 * Hop thoai "xac minh lai bo me" truoc mot thao tac kho hoan tac.
 *
 * Phien bo me dang mo chua du cho viec lon: phien song 8 gio, tablet co the
 * dang nam trong tay tre. Nen hoi lai PIN ngay luc bam — va server cung kiem
 * lai (reverifyParent), khong tin moi UI.
 *
 * PIN dang tat thi khong co gi de hoi: chi con buoc bam xac nhan.
 *
 * `onConfirm` nem loi = hop thoai giu nguyen va hien loi (vd: sai PIN).
 * Thanh cong thi ben goi tu dong hop thoai.
 */
export function PinConfirm({
  title,
  confirmLabel,
  onConfirm,
  onClose,
  children,
}: {
  title: string
  confirmLabel: string
  onConfirm: (pin: string) => Promise<void>
  onClose: () => void
  children: React.ReactNode
}): React.ReactElement {
  const me = useLoad(() => adminApi.me())
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Khong tai duoc /me thi cu hoi PIN: server moi la noi quyet dinh, PIN
  // dang tat thi no bo qua o nay.
  const pinOn = me.data?.pinEnabled ?? true
  const ready = !me.loading
  const canSubmit = ready && !busy && (!pinOn || pin.length >= 4)

  async function submit(): Promise<void> {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await onConfirm(pinOn ? pin : '')
    } catch (err) {
      setPin('')
      setError(err instanceof ApiError ? err.message : 'Không thực hiện được')
      inputRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={title}
      subtitle="Bố mẹ xác minh lại một lần nữa"
      icon="🔐"
      iconColor={C.danger}
      locked={busy}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose} disabled={busy}>
            Huỷ
          </Btn>
          <Btn variant="danger" onClick={() => void submit()} disabled={!canSubmit}>
            {busy ? 'Đang xử lý…' : confirmLabel}
          </Btn>
        </>
      }
    >
      <div className="mb-4 text-sm" style={{ color: 'var(--text-dim)', lineHeight: 1.55 }}>
        {children}
      </div>

      {!ready ? (
        <Spinner />
      ) : pinOn ? (
        <Field label="Nhập PIN của bố mẹ để xác nhận">
          <Input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={12}
            autoFocus
            value={pin}
            onChange={(e) => {
              setPin(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
            }}
          />
        </Field>
      ) : (
        <Alert kind="warn">PIN đang tắt nên chỉ cần bấm xác nhận.</Alert>
      )}

      {error ? <Alert kind="error">{error}</Alert> : null}
    </Dialog>
  )
}
