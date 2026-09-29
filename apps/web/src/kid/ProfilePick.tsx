import { useEffect, useState } from 'react'
import { type KidProfile, kidApi } from '@/lib/api'
import { useAutoFocus } from '@/nav/spatial'
import { EmptyState, Spinner } from '@/ui/Spinner'
import { FocusButton } from '@/ui/Focusable'
import { ParentGateButton } from '@/ui/ParentGate'
import { tryFullscreen } from '@/lib/tv'
import { CARD_HI, mix } from '@/lib/color'

interface ProfilePickProps {
  onPick: (profile: KidProfile) => void
  onOpenParentGate: () => void
}

/**
 * Chon be bang AVATAR, khong mat khau.
 * Ly do: tre chua doc chu, va viec nhan dien "con vat cua minh" la du —
 * profile o day khong phai co che bao mat, chi la de tach quota va ke rieng.
 */
export function ProfilePick({ onPick, onOpenParentGate }: ProfilePickProps): React.ReactElement {
  const [profiles, setProfiles] = useState<KidProfile[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    kidApi
      .profiles()
      .then((r) => setProfiles(r.profiles))
      .catch(() => setError('Không kết nối được với máy chủ. Kiểm tra xem server có đang chạy.'))
  }, [])

  useAutoFocus(profiles !== null, [profiles])

  if (error) {
    return (
      <div className="grid h-full place-items-center">
        <EmptyState emoji="🔌" title="Không kết nối được" hint={error} />
      </div>
    )
  }

  if (!profiles) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner label="Đang tải…" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col" style={{ padding: 'var(--safe-pad)' }}>
      <div className="flex items-start justify-end">
        <ParentGateButton onOpen={onOpenParentGate} />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-10">
        <h1 className="text-center text-4xl font-extrabold">Ai đang xem nào?</h1>

        {profiles.length === 0 ? (
          <EmptyState
            emoji="🧸"
            title="Chưa có bé nào"
            hint="Giữ icon ⚙ ở góc trên 3 giây để vào trang bố mẹ và thêm bé."
          />
        ) : (
          <div className="flex flex-wrap justify-center gap-7">
            {profiles.map((p) => (
              <FocusButton
                key={p.id}
                className="flex flex-col items-center gap-3 rounded-3xl p-5"
                ringColor={p.color}
                style={{ background: 'var(--card)', border: 'none', cursor: 'pointer' }}
                onClick={() => {
                  // LG webOS khong cai duoc PWA, nen fullscreen la cach duy nhat
                  // an thanh dia chi cua trinh duyet. Phai goi trong user gesture.
                  void tryFullscreen()
                  onPick(p)
                }}
                aria-label={`Vào với bé ${p.name}`}
              >
                <span
                  className="grid place-items-center rounded-full"
                  style={{
                    width: 132,
                    height: 132,
                    fontSize: 72,
                    background: mix(p.color, CARD_HI, 0.26),
                    border: `4px solid ${p.color}`,
                    lineHeight: 1,
                  }}
                  aria-hidden="true"
                >
                  {p.avatar}
                </span>
                <span className="text-2xl font-extrabold">{p.name}</span>
              </FocusButton>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
