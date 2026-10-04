import { useEffect, useState } from 'react'
import { adminApi, ApiError, kidApi, type Quota } from '@/lib/api'
import { useBackHandler } from '@/lib/back'
import { currentMode } from '@/lib/mode'
import { FocusButton } from '@/ui/Focusable'
import { HOLD_MS, PinDialog, useLongPress } from '@/ui/ParentGate'

/**
 * "Bố mẹ cho thêm giờ" ngay tren man het gio — khoi phai vao trang quan tri.
 *
 * HAI BUOC, cong bo me TRUOC roi moi chon so phut (be khong chon truoc duoc):
 *   1. PIN — hoac GIU 3 GIAY khi bo me da tat PIN. Tat PIN ma bam la cong
 *      ngay thi be tu bam duoc, gioi han gio thanh vo nghia; giu 3 giay la
 *      cung lop "giau" voi nut ⚙.
 *   2. Chon +15 / +30 / +60 phut. Het SO VIDEO thi chi co "Cho xem tiếp".
 *
 * Server kiem lai PIN o ca hai buoc va chi cap khi be dang bi chan vi mot
 * ly do go duoc — xem /api/kid/grant.
 */

/** Ly do chan ma cho them gio go duoc — khop GRANTABLE_REASONS o server. */
export const GRANTABLE: ReadonlyArray<Quota['reason']> = ['daily_limit', 'session_limit', 'video_limit']

const MINUTE_OPTIONS = [
  { minutes: 15, label: '+15 phút' },
  { minutes: 30, label: '+30 phút' },
  { minutes: 60, label: '+1 giờ' },
]

type Stage = 'loading' | 'pin' | 'hold' | 'choose'

export function GrantTime({
  profileId,
  profileName,
  reason,
  onGranted,
  onCancel,
}: {
  profileId: number
  profileName: string
  reason: Quota['reason']
  onGranted: (quota: Quota) => void
  onCancel: () => void
}): React.ReactElement | null {
  const [stage, setStage] = useState<Stage>('loading')
  const [pin, setPin] = useState('')
  const [pinIsDefault, setPinIsDefault] = useState(false)

  // Hoi server MOI LAN mo: bo me co the vua bat/tat PIN tu may khac.
  // Loi -> coi nhu co PIN (server moi la noi quyet dinh).
  useEffect(() => {
    let cancelled = false
    adminApi
      .me()
      .then((me) => {
        if (cancelled) return
        setPinIsDefault(me.pinIsDefault)
        setStage(me.pinEnabled ? 'pin' : 'hold')
      })
      .catch(() => {
        if (!cancelled) setStage('pin')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (stage === 'loading') return null

  if (stage === 'pin') {
    return (
      <PinDialog
        title="Bố mẹ cho thêm giờ"
        subtitle={`Nhập PIN để cho ${profileName} xem thêm`}
        submitLabel="Tiếp"
        verify={(p) => kidApi.grantVerify(p)}
        onSuccess={(p) => {
          setPin(p)
          setStage('choose')
        }}
        onCancel={onCancel}
      >
        {pinIsDefault ? (
          <p
            className="mb-4 rounded-xl px-3 py-2 text-center text-sm font-bold"
            style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}
          >
            PIN vẫn là mặc định — con có thể đoán được. Đổi trong trang bố mẹ → Cài đặt.
          </p>
        ) : null}
      </PinDialog>
    )
  }

  if (stage === 'hold') {
    return <HoldStep profileName={profileName} onDone={() => setStage('choose')} onCancel={onCancel} />
  }

  return (
    <ChooseStep
      profileId={profileId}
      profileName={profileName}
      reason={reason}
      pin={pin}
      onGranted={onGranted}
      onCancel={onCancel}
    />
  )
}

/** Khung hop thoai cung kieu voi hop nhap PIN. */
function Modal({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-6"
      style={{ background: 'var(--scrim)', backdropFilter: 'blur(6px)' }}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className="anim-pop w-full max-w-sm rounded-3xl p-6" style={{ background: 'var(--bg-elev)' }}>
        {children}
      </div>
    </div>
  )
}

/** Bo me tat PIN: giu nut 3 giay (cham tay hoac giu OK tren remote). */
function HoldStep({
  profileName,
  onDone,
  onCancel,
}: {
  profileName: string
  onDone: () => void
  onCancel: () => void
}): React.ReactElement {
  const { progress, handlers } = useLongPress(onDone)
  useBackHandler(onCancel)

  return (
    <Modal label="Bố mẹ cho thêm giờ">
      <h2 className="mb-1 text-center text-2xl font-extrabold">Bố mẹ cho thêm giờ</h2>
      <p className="mb-5 text-center text-sm" style={{ color: 'var(--text-dim)' }}>
        Bố mẹ giữ nút bên dưới {HOLD_MS / 1000} giây để cho {profileName} xem thêm
      </p>

      <FocusButton
        className="kbtn kbtn-primary relative w-full overflow-hidden"
        sound="none"
        autoFocus={currentMode() === 'tv'}
        aria-label={`Giữ ${HOLD_MS / 1000} giây để cho thêm giờ`}
        {...handlers}
      >
        {/* Thanh day dan khi giu — biet ngay la dang co tac dung */}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0"
          style={{ width: `${progress * 100}%`, background: 'rgba(255, 255, 255, 0.28)' }}
        />
        <span className="relative">✋ Giữ {HOLD_MS / 1000} giây</span>
      </FocusButton>

      <FocusButton className="kbtn kbtn-ghost mt-3 w-full" onClick={onCancel} sound="back">
        Thoát
      </FocusButton>
    </Modal>
  )
}

function ChooseStep({
  profileId,
  profileName,
  reason,
  pin,
  onGranted,
  onCancel,
}: {
  profileId: number
  profileName: string
  reason: Quota['reason']
  pin: string
  onGranted: (quota: Quota) => void
  onCancel: () => void
}): React.ReactElement {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useBackHandler(() => {
    if (!busy) onCancel()
  })

  // Het SO VIDEO thi "them phut" khong co nghia — chi cho xem tiep mot luot.
  const options =
    reason === 'video_limit' ? [{ minutes: 0, label: '▶️ Cho xem tiếp' }] : MINUTE_OPTIONS

  async function grant(minutes: number): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const r = await kidApi.grant(profileId, minutes, pin)
      if (r.quota.allowed) {
        onGranted(r.quota)
        return
      }
      // Hiem: hom nay da xem VUOT gioi han (vd: bo me vua ha gioi han) —
      // phut vua cho van duoc cong, chon them la du.
      setError('Vẫn chưa đủ — hôm nay con đã xem quá giới hạn. Chọn thêm nữa nhé.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không cho thêm được')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal label={`Cho ${profileName} xem thêm`}>
      <h2 className="mb-1 text-center text-2xl font-extrabold">Cho {profileName} xem thêm</h2>
      <p className="mb-5 text-center text-sm" style={{ color: 'var(--text-dim)' }}>
        {reason === 'video_limit'
          ? 'Con đã xem đủ số video của lượt này'
          : 'Thời gian thêm chỉ tính cho hôm nay'}
      </p>

      {error ? (
        <p
          className="mb-4 rounded-xl px-3 py-2 text-center text-sm font-bold"
          style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2.5">
        {options.map((o, i) => (
          <FocusButton
            key={o.minutes}
            className="kbtn kbtn-primary w-full"
            disabled={busy}
            style={{ opacity: busy ? 0.5 : 1, fontWeight: 800 }}
            autoFocus={i === 0 && currentMode() === 'tv'}
            onClick={() => void grant(o.minutes)}
          >
            {o.label}
          </FocusButton>
        ))}
        <FocusButton className="kbtn kbtn-ghost w-full" onClick={onCancel} disabled={busy} sound="back">
          Thoát
        </FocusButton>
      </div>
    </Modal>
  )
}
