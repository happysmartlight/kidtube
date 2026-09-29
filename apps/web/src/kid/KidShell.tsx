import type { KidProfile, Quota } from '@/lib/api'
import { formatMinutes } from '@/lib/format'
import { FocusButton } from '@/ui/Focusable'
import { ParentGateButton } from '@/ui/ParentGate'
import { CARD, CARD_HI, mix } from '@/lib/color'

export type KidTab = 'home' | 'favorites' | 'channels'

interface KidShellProps {
  profile: KidProfile
  quota: Quota | null
  tab: KidTab
  onTab: (tab: KidTab) => void
  onSwitchProfile: () => void
  onOpenParentGate: () => void
  children: React.ReactNode
}

const TABS: Array<{ id: KidTab; emoji: string; label: string }> = [
  { id: 'home', emoji: '🏠', label: 'Trang chủ' },
  { id: 'favorites', emoji: '❤️', label: 'Yêu thích' },
  { id: 'channels', emoji: '📺', label: 'Kênh' },
]

/**
 * Khung bao cua giao dien tre: header + vung noi dung cuon + nav duoi.
 *
 * Nav chi co BA nut, moi nut rat to. Khong co menu an, khong co "thêm",
 * khong co breadcrumb — tre phai thay het lua chon cua minh cung mot luc.
 */
export function KidShell({
  profile,
  quota,
  tab,
  onTab,
  onSwitchProfile,
  onOpenParentGate,
  children,
}: KidShellProps): React.ReactElement {
  const remaining = quota
    ? smallest(quota.dailyRemainingSec, quota.sessionRemainingSec)
    : null

  return (
    <div className="flex h-full flex-col">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <header
        className="flex shrink-0 items-center justify-between gap-3"
        style={{
          height: 'var(--header-h)',
          paddingLeft: 'var(--safe-pad)',
          paddingRight: 'var(--safe-pad)',
        }}
      >
        <FocusButton
          className="flex items-center gap-3 rounded-full py-1.5 pr-5 pl-1.5"
          ringColor={profile.color}
          style={{ background: 'var(--card)', border: 'none', cursor: 'pointer' }}
          onClick={onSwitchProfile}
          sound="back"
          aria-label={`Đang là bé ${profile.name}. Bấm để đổi bé.`}
        >
          <span
            className="grid place-items-center rounded-full"
            style={{
              width: 48,
              height: 48,
              fontSize: 28,
              background: mix(profile.color, CARD_HI, 0.3),
              lineHeight: 1,
            }}
            aria-hidden="true"
          >
            {profile.avatar}
          </span>
          <span className="text-xl font-extrabold">{profile.name}</span>
        </FocusButton>

        <div className="flex items-center gap-3">
          {remaining !== null ? (
            <span
              className="rounded-full px-4 py-2 font-extrabold tabular-nums"
              style={{
                background: quota?.warning ? mix('#ff6b8a', CARD, 0.26) : 'var(--card)',
                color: quota?.warning ? 'var(--danger)' : 'var(--text-dim)',
                fontSize: 'calc(var(--font-title) * 0.95)',
              }}
              // Doc bang giong noi khi doi -> tre dung man hinh doc hieu duoc
              aria-live="polite"
            >
              ⏱ Còn {formatMinutes(remaining)}
            </span>
          ) : null}

          <ParentGateButton onOpen={onOpenParentGate} />
        </div>
      </header>

      {/* ─── Noi dung ───────────────────────────────────────────── */}
      <main className="scroll-y min-h-0 flex-1">{children}</main>

      {/* ─── Nav duoi: 3 nut cuc to ─────────────────────────────── */}
      <nav
        className="flex shrink-0 items-stretch justify-around gap-2"
        style={{
          height: 'var(--nav-h)',
          background: 'var(--bg-elev)',
          paddingLeft: 'var(--safe-pad)',
          paddingRight: 'var(--safe-pad)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          borderTop: '2px solid var(--card)',
        }}
      >
        {TABS.map((t) => {
          const active = t.id === tab
          return (
            <FocusButton
              key={t.id}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl"
              style={{
                background: active ? 'var(--card-hi)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: active ? 'var(--focus)' : 'var(--text-dim)',
                maxWidth: 260,
              }}
              onClick={() => onTab(t.id)}
              aria-label={t.label}
              aria-current={active ? 'page' : undefined}
            >
              <span
                style={{ fontSize: 'calc(var(--nav-h) * 0.36)', lineHeight: 1 }}
                aria-hidden="true"
              >
                {t.emoji}
              </span>
              <span style={{ fontSize: 'calc(var(--font-title) * 0.85)', fontWeight: 800 }}>
                {t.label}
              </span>
            </FocusButton>
          )
        })}
      </nav>
    </div>
  )
}

function smallest(a: number | null, b: number | null): number | null {
  if (a === null) return b
  if (b === null) return a
  return Math.min(a, b)
}
