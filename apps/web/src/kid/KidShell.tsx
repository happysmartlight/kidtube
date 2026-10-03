import type { KidProfile, Quota } from '@/lib/api'
import { formatMinutes } from '@/lib/format'
import { FocusButton } from '@/ui/Focusable'
import { ParentGateButton } from '@/ui/ParentGate'
import { withAlpha } from '@/lib/color'

export type KidTab = 'home' | 'channels'

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
  { id: 'channels', emoji: '📺', label: 'Kênh' },
]

/**
 * Khung bao cua giao dien tre: vung noi dung cuon + MOT thanh duoi duy nhat.
 *
 * Truoc day co them mot header rieng o tren chua avatar be, dong ho va nut ⚙.
 * Da gop het xuong thanh duoi: dinh tren man hinh gio chi con hang nut chon
 * chu de, nen luoi video duoc them ~72px chieu cao (tablet). Ba thu kia deu la
 * dieu khien chu khong phai noi dung, nen o cung mot cho voi nav la hop ly.
 *
 * Bo cuc thanh duoi: [avatar be] ... [2 nut chinh] ... [dong ho] [⚙]
 * Hai ben dung `flex: 1` de cum nut chinh luon nam GIUA man hinh du ten be
 * dai ngan khac nhau.
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
  const remaining = quota ? smallest(quota.dailyRemainingSec, quota.sessionRemainingSec) : null

  return (
    <div className="flex h-full flex-col">
      {/* ─── Noi dung (chiem gan het man hinh) ──────────────────────
          KHONG tu cuon: moi trang tu chia phan dau co dinh + phan cuon
          bang <KidPage>. */}
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>

      {/* ─── Thanh duoi: dieu khien + dieu huong ─────────────────── */}
      <nav className="kbar">
        {/* Trai: doi be */}
        <div className="kbar-side">
          <FocusButton
            className="kbar-profile"
            ringColor={profile.color}
            onClick={onSwitchProfile}
            sound="back"
            aria-label={`Đang là bé ${profile.name}. Bấm để đổi bé.`}
          >
            <span
              className="kbar-avatar"
              style={{ background: withAlpha(profile.color, 0.3) }}
              aria-hidden="true"
            >
              {profile.avatar}
            </span>
            <span className="kbar-profile-name">{profile.name}</span>
          </FocusButton>
        </div>

        {/* Giua: cac nut chinh */}
        <div className="kbar-tabs">
          {TABS.map((t) => {
            const active = t.id === tab
            return (
              <FocusButton
                key={t.id}
                className="kbar-tab"
                style={{
                  // Dang chon = chu trang tren nen sang hon; chua chon = chu mo.
                  // Khong to do o day — mau do de danh cho thanh tien do / nut phat.
                  background: active ? 'var(--card-hi)' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--text-dim)',
                }}
                onClick={() => onTab(t.id)}
                aria-label={t.label}
                aria-current={active ? 'page' : undefined}
              >
                <span className="kbar-tab-emoji" aria-hidden="true">
                  {t.emoji}
                </span>
                <span className="kbar-tab-label">{t.label}</span>
              </FocusButton>
            )
          })}
        </div>

        {/* Phai: thoi gian con lai + loi vao trang bo me */}
        <div className="kbar-side kbar-side-end">
          {remaining !== null ? (
            <span
              className="kbar-time"
              style={{
                background: quota?.warning ? withAlpha('#ff6b8a', 0.26) : 'var(--card)',
                color: quota?.warning ? 'var(--danger)' : 'var(--text-dim)',
              }}
              // Doc bang giong noi khi doi -> tre dung man hinh doc hieu duoc
              aria-live="polite"
            >
              ⏱ Còn {formatMinutes(remaining)}
            </span>
          ) : null}

          <ParentGateButton onOpen={onOpenParentGate} />
        </div>
      </nav>
    </div>
  )
}

/**
 * Bo cuc mot trang trong shell: `header` dung yen o tren, `children` cuon.
 *
 * Vi sao khong de ca trang cuon va cho hang nut "dinh" (sticky) nhu truoc:
 * hang nut dinh phai co nen DAC de che card cuon qua ben duoi, ma nen dac
 * thi che mat nen chuyen mau dung o phan dam mau nhat (dinh man hinh). Tach
 * ra thi card khong bao gio luon duoi hang nut, nen hang nut trong suot duoc.
 */
export function KidPage({
  header,
  children,
}: {
  header?: React.ReactNode
  children: React.ReactNode
}): React.ReactElement {
  return (
    <>
      {header}
      <div className="scroll-y min-h-0 flex-1">{children}</div>
    </>
  )
}

function smallest(a: number | null, b: number | null): number | null {
  if (a === null) return b
  if (b === null) return a
  return Math.min(a, b)
}
