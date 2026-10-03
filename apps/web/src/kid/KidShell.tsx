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
  const binding = quota ? bindingLimit(quota) : null
  const warning = quota?.warning === true

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
            <span className="kbar-avatar-wrap" aria-hidden="true">
              <span className="kbar-avatar" style={{ background: withAlpha(profile.color, 0.3) }}>
                {profile.avatar}
              </span>

              {/* Vong + nhan so phut — CHI hien o man hinh hep (xem index.css),
                  thay cho chip "⏱ Còn … phút" khong con cho o ben phai. */}
              {binding ? (
                <>
                  <TimeRing
                    fraction={binding.remainingSec / binding.limitSec}
                    color={warning ? 'var(--danger)' : profile.color}
                  />
                  <span
                    className="kbar-ring-badge"
                    style={
                      warning ? { background: 'var(--danger)', color: '#2a0010' } : undefined
                    }
                  >
                    {compactMinutes(binding.remainingSec)}
                  </span>
                </>
              ) : null}
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
            <>
              <span
                className="kbar-time"
                style={{
                  background: warning ? withAlpha('#ff6b8a', 0.26) : 'var(--card)',
                  color: warning ? 'var(--danger)' : 'var(--text-dim)',
                }}
                aria-hidden="true"
              >
                ⏱ Còn {formatMinutes(remaining)}
              </span>
              {/* Doc bang giong noi khi doi. Tach khoi chip vi chip bi AN
                  (display: none) o man hinh hep — an thi trinh doc man hinh
                  cung khong doc nua. */}
              <span className="sr-only" aria-live="polite">
                Còn {formatMinutes(remaining)}
              </span>
            </>
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

/**
 * Gioi han SAP HET TRUOC (theo ngay hoac theo luot) — cung quy tac voi
 * `effectiveRemaining` o server (services/timeLimit.ts). null = khong dat gioi
 * han nao -> khong ve vong.
 */
function bindingLimit(q: Quota): { remainingSec: number; limitSec: number } | null {
  const opts: Array<{ remainingSec: number; limitSec: number }> = []
  if (q.dailyRemainingSec !== null && q.dailyLimitSec > 0) {
    opts.push({ remainingSec: q.dailyRemainingSec, limitSec: q.dailyLimitSec })
  }
  if (q.sessionRemainingSec !== null && q.sessionLimitSec > 0) {
    opts.push({ remainingSec: q.sessionRemainingSec, limitSec: q.sessionLimitSec })
  }
  opts.sort((a, b) => a.remainingSec - b.remainingSec)
  return opts[0] ?? null
}

/**
 * Nhan gon cho vong: "15′", "1g", "1g05". Lam tron LEN — con 20 giay thi
 * hien "1′" chu khong phai "0′" (0 nghia la het gio, de gay hieu nham).
 */
function compactMinutes(sec: number): string {
  const totalMin = Math.max(0, Math.ceil(sec / 60))
  if (totalMin < 60) return `${totalMin}′`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m === 0 ? `${h}g` : `${h}g${String(m).padStart(2, '0')}`
}

/**
 * Vong tron quanh avatar = phan thoi gian CON LAI, ngan dan khi xem (nhu dong
 * ho cat). Tre chua doc so van thay "vong sap het". Bat dau o dinh, chay
 * theo chieu kim dong ho — cung kieu vong giu nut ⚙ trong ParentGate.
 */
function TimeRing({ fraction, color }: { fraction: number; color: string }): React.ReactElement {
  const C = 2 * Math.PI * 45 // chu vi, r = 45 trong viewBox 100
  const f = Math.max(0, Math.min(1, fraction))
  return (
    <svg className="kbar-ring" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="8" />
      <circle
        cx="50"
        cy="50"
        r="45"
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${f * C} ${C}`}
        transform="rotate(-90 50 50)"
      />
    </svg>
  )
}

function smallest(a: number | null, b: number | null): number | null {
  if (a === null) return b
  if (b === null) return a
  return Math.min(a, b)
}
