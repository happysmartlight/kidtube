import { useEffect, useRef, useState } from 'react'
import { kidApi, type Quota } from '@/lib/api'
import { formatMinutes } from '@/lib/format'
import { sfx } from '@/lib/sfx'
import { FocusButton } from '@/ui/Focusable'
import { ParentGateButton } from '@/ui/ParentGate'

interface TimeUpProps {
  quota: Quota
  profileId: number
  onRecheck: (quota: Quota) => void
  onSwitchProfile: () => void
  onOpenParentGate: () => void
}

/**
 * Man hinh khoa khi het gio.
 *
 * Nguyen tac thiet ke: KHONG doa tre, khong "Truy cap bi tu choi".
 * Noi nhu nguoi lon tu te noi voi tre: viec da xong, mai lam tiep.
 *
 * Man hinh nay tu kiem tra lai quota moi 30 giay — vi gioi han theo LUOT
 * se tu het sau 10 phut khong hoat dong, va bo me co the cap them gio
 * tu trang quan tri. Tre khong phai tai lai trang.
 */
export function TimeUp({
  quota,
  profileId,
  onRecheck,
  onSwitchProfile,
  onOpenParentGate,
}: TimeUpProps): React.ReactElement {
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    sfx.timeUp()
  }, [])

  // Ref de `onRecheck` khong on dinh khong lam interval bi tao lai lien tuc
  // (cung ho bug voi vong lap trong Home).
  const onRecheckRef = useRef(onRecheck)
  useEffect(() => {
    onRecheckRef.current = onRecheck
  }, [onRecheck])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void kidApi
        .quota(profileId)
        .then((r) => {
          if (r.quota.allowed) onRecheckRef.current(r.quota)
        })
        .catch(() => {})
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [profileId])

  const art = ARTWORK[quota.reason ?? 'daily_limit'] ?? FALLBACK_ART

  return (
    <div
      className="flex h-full flex-col"
      // Khong to nen: de nen chuyen mau cua body lo ra, giong cac trang khac.
      style={{ padding: 'var(--safe-pad)' }}
    >
      <div className="flex justify-end">
        <ParentGateButton onOpen={onOpenParentGate} />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <div className="anim-wave" style={{ fontSize: 110 }} aria-hidden="true">
          {art.emoji}
        </div>

        <h1 className="text-4xl font-extrabold" style={{ maxWidth: 620, lineHeight: 1.25 }}>
          {quota.message ?? art.fallback}
        </h1>

        {quota.reason === 'daily_limit' && quota.dailyLimitSec > 0 ? (
          <p style={{ color: 'var(--text-dim)', fontSize: 20 }}>
            Hôm nay con đã xem {formatMinutes(quota.dailyUsedSec)} rồi.
          </p>
        ) : null}

        {quota.reason === 'session_limit' ? (
          <p style={{ color: 'var(--text-dim)', fontSize: 20 }}>
            Nghỉ khoảng 10 phút là con xem tiếp được nhé.
          </p>
        ) : null}

        {quota.reason === 'outside_window' ? (
          <p style={{ color: 'var(--text-dim)', fontSize: 20 }}>
            Giờ xem: {quota.allowedFrom} – {quota.allowedTo}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          <FocusButton
            className="kbtn kbtn-ghost"
            disabled={checking}
            onClick={() => {
              setChecking(true)
              void kidApi
                .quota(profileId)
                .then((r) => {
                  if (r.quota.allowed) onRecheck(r.quota)
                  else sfx.nope()
                })
                .finally(() => setChecking(false))
            }}
          >
            {checking ? 'Đang kiểm tra…' : '🔄 Xem lại được chưa?'}
          </FocusButton>

          <FocusButton className="kbtn kbtn-ghost" onClick={onSwitchProfile} sound="back">
            👥 Đổi bé
          </FocusButton>
        </div>
      </div>
    </div>
  )
}

interface Artwork {
  emoji: string
  fallback: string
}

const FALLBACK_ART: Artwork = {
  emoji: '🌙',
  fallback: 'Hôm nay xem đủ rồi. Mai mình xem tiếp nhé!',
}

const ARTWORK: Record<string, Artwork> = {
  daily_limit: { emoji: '🌙', fallback: 'Hôm nay xem đủ rồi. Mai mình xem tiếp nhé!' },
  session_limit: { emoji: '🧸', fallback: 'Nghỉ một chút nhé! Lát nữa quay lại xem tiếp.' },
  video_limit: { emoji: '🧸', fallback: 'Xem đủ số video rồi. Nghỉ một chút nhé!' },
  outside_window: { emoji: '🌙', fallback: 'Chưa tới giờ xem. Hẹn gặp lại nhé!' },
  profile_inactive: { emoji: '🔒', fallback: 'Hồ sơ này đang tắt. Nhờ bố mẹ bật lại nhé!' },
}
