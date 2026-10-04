import { useEffect, useRef, useState } from 'react'
import { adminApi } from '@/lib/api'
import { C } from '@/lib/color'
import { formatBytes, formatMinutes } from '@/lib/format'
import { safeScrollIntoView } from '@/lib/tv'
import { Spinner } from '@/ui/Spinner'
import { Downloads } from './Downloads'
import { Profiles } from './Profiles'
import { Reports } from './Reports'
import { Review } from './Review'
import { Settings } from './Settings'
import { Shelves } from './Shelves'
import { Sources } from './Sources'
import { Alert, Badge, Btn, Panel, ToastHost, useLoad } from './ui'

type Tab = 'dashboard' | 'sources' | 'review' | 'shelves' | 'profiles' | 'downloads' | 'reports' | 'settings'

/**
 * Cac muc cua trang bo me. `desc` hien duoi tieu de muc dang mo — bo me
 * moi dung lan dau biet ngay muc nay de lam gi.
 * Emoji co VS16 (U+FE0F) de hien dang emoji mau: ⬇ / ⚙ tran trui hien
 * thanh ky hieu chu trang tren Windows.
 */
const TABS: Array<{ id: Tab; label: string; emoji: string; desc: string }> = [
  { id: 'dashboard', label: 'Tổng quan', emoji: '📊', desc: 'Việc cần làm, các bé hôm nay, dung lượng tải về' },
  { id: 'sources', label: 'Nguồn', emoji: '📡', desc: 'Kênh, playlist, video lẻ — nơi lấy video mới về' },
  { id: 'review', label: 'Hàng chờ duyệt', emoji: '⏳', desc: 'Video mới về phải được duyệt mới đến được với con' },
  { id: 'shelves', label: 'Kệ', emoji: '🗂️', desc: 'Các hàng video trên trang chủ của con' },
  { id: 'profiles', label: 'Bé', emoji: '🧒', desc: 'Hồ sơ từng bé, giới hạn thời gian xem' },
  { id: 'downloads', label: 'Tải offline', emoji: '⬇️', desc: 'Video lưu sẵn trên máy, xem được khi mất mạng' },
  { id: 'reports', label: 'Báo cáo', emoji: '📈', desc: 'Con xem gì, xem bao lâu' },
  { id: 'settings', label: 'Cài đặt', emoji: '⚙️', desc: 'Hệ thống, cập nhật, phát video, giao diện, PIN' },
]

export function AdminApp({ onExit }: { onExit: () => void }): React.ReactElement {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [pendingCount, setPendingCount] = useState<number | null>(null)

  // Dem so video cho duyet de hien tren tab — bo me can thay ngay co viec hay khong.
  useEffect(() => {
    let cancelled = false
    const load = (): void => {
      void adminApi
        .stats()
        .then((s) => {
          if (!cancelled) setPendingCount(s.pendingCount)
        })
        .catch(() => {})
    }
    load()
    const t = window.setInterval(load, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
  }, [tab])

  const current = TABS.find((t) => t.id === tab) ?? TABS[0]!

  // Man hep: hang muc cuon ngang — dua muc dang chon vao tam nhin (vd: bam
  // "Duyệt ngay →" o Tong quan nhay sang muc nam ngoai mep phai).
  const activeTabRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (activeTabRef.current) safeScrollIntoView(activeTabRef.current)
  }, [tab])

  return (
    // Nen trong suot: nen chuyen mau do / xanh cua body lo ra, giong giao dien be.
    <div data-admin className="flex h-full flex-col">
      <header className="admin-header">
        <div style={{ maxWidth: 1212, margin: '0 auto' }}>
          <div className="flex items-center gap-3 px-4 pt-3 pb-2.5">
            <span
              className="grid shrink-0 place-items-center rounded-xl"
              style={{
                width: 38,
                height: 38,
                fontSize: 20,
                background: 'linear-gradient(135deg, #b00020 0%, #1234aa 100%)',
              }}
              aria-hidden="true"
            >
              🧸
            </span>
            <div className="min-w-0 flex-1" style={{ lineHeight: 1.2 }}>
              <h1 className="truncate text-lg font-extrabold">KidTube</h1>
              <p className="truncate text-xs" style={{ color: 'var(--text-dim)' }}>
                Trang của bố mẹ
              </p>
            </div>

            <Btn
              small
              onClick={() => {
                void adminApi.logout().finally(onExit)
              }}
              title="Đăng xuất trang bố mẹ và quay về giao diện của con"
            >
              <span aria-hidden="true">↩</span>
              <span className="sm:hidden">Về của con</span>
              <span className="hidden sm:inline">Về giao diện của con</span>
            </Btn>
          </div>

          <nav className="admin-tabs" aria-label="Các mục của trang bố mẹ">
            {TABS.map((t) => {
              const on = tab === t.id
              const badge = t.id === 'review' && pendingCount !== null && pendingCount > 0
              return (
                <button
                  key={t.id}
                  ref={on ? activeTabRef : undefined}
                  type="button"
                  className="admin-tab"
                  aria-current={on ? 'page' : undefined}
                  onClick={() => setTab(t.id)}
                >
                  <span aria-hidden="true">{t.emoji}</span>
                  {t.label}
                  {badge ? (
                    <span className="admin-tab-count" aria-label={`${pendingCount} video chờ duyệt`}>
                      {pendingCount}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      <main className="scroll-y min-h-0 flex-1 px-4 pt-5 pb-8">
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          {/* Ten + y nghia cua muc dang mo: hang chip o tren nho, de bo qua */}
          <div className="mb-5 flex items-center gap-3.5">
            <span
              className="grid shrink-0 place-items-center rounded-2xl"
              style={{
                width: 52,
                height: 52,
                fontSize: 26,
                background: 'var(--card)',
                border: '1px solid var(--panel-border)',
              }}
              aria-hidden="true"
            >
              {current.emoji}
            </span>
            <div className="min-w-0">
              <h2 className="text-2xl font-extrabold" style={{ lineHeight: 1.2 }}>
                {current.label}
              </h2>
              <p className="mt-0.5 text-sm" style={{ color: 'var(--text-dim)' }}>
                {current.desc}
              </p>
            </div>
          </div>

          {tab === 'dashboard' ? <Dashboard onGo={setTab} /> : null}
          {tab === 'sources' ? <Sources /> : null}
          {tab === 'review' ? <Review /> : null}
          {tab === 'shelves' ? <Shelves /> : null}
          {tab === 'profiles' ? <Profiles /> : null}
          {tab === 'downloads' ? <Downloads /> : null}
          {tab === 'reports' ? <Reports /> : null}
          {tab === 'settings' ? <Settings /> : null}
        </div>
      </main>

      <ToastHost />
    </div>
  )
}

function Dashboard({ onGo }: { onGo: (t: Tab) => void }): React.ReactElement {
  const stats = useLoad(() => adminApi.stats())
  const profiles = useLoad(() => adminApi.profiles())
  const settings = useLoad(() => adminApi.settings())

  if (stats.loading && !stats.data) return <Spinner />
  if (stats.error) return <Alert kind="error">{stats.error}</Alert>

  const s = stats.data
  const sys = settings.data?.system
  const pinIsDefault = false // hien thi trong tab Cai dat

  return (
    <>
      {/* Viec can lam — dat tren cung vi day la ly do bo me mo trang nay */}
      {s && s.pendingCount > 0 ? (
        <Alert kind="warn">
          Có <b>{s.pendingCount} video đang chờ duyệt</b>.{' '}
          <button
            type="button"
            onClick={() => onGo('review')}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              textDecoration: 'underline',
              cursor: 'pointer',
              font: 'inherit',
            }}
          >
            Duyệt ngay →
          </button>
        </Alert>
      ) : null}

      {s && s.approvedCount === 0 && s.sourceCount === 0 ? (
        <Alert kind="info">
          <b>Bắt đầu từ đâu:</b> vào tab <b>Nguồn</b> → dán link kênh YouTube → xem trước → thêm.
          Sau đó sang <b>Hàng chờ duyệt</b> để duyệt video, rồi xếp vào <b>Kệ</b>. Con chỉ thấy
          video đã duyệt <i>và</i> đã xếp kệ.
        </Alert>
      ) : null}

      {sys && !sys.ytdlpAvailable ? (
        <Alert kind="warn">
          Không có <b>yt-dlp</b>: thiếu thời lượng video, không lấy được toàn bộ lịch sử kênh, và
          không tải offline được. Xem chi tiết ở tab <b>Cài đặt</b>.
        </Alert>
      ) : null}

      <div
        className="mb-5 grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}
      >
        <Stat label="Chờ duyệt" value={s?.pendingCount ?? 0} color={C.warn} onClick={() => onGo('review')} />
        <Stat label="Đã duyệt" value={s?.approvedCount ?? 0} color={C.ok} onClick={() => onGo('review')} />
        <Stat label="Đã loại" value={s?.rejectedCount ?? 0} color={C.dim} onClick={() => onGo('review')} />
        <Stat label="Nguồn" value={s?.sourceCount ?? 0} color={C.info} onClick={() => onGo('sources')} />
        <Stat label="Kệ" value={s?.shelfCount ?? 0} color="#a78bfa" onClick={() => onGo('shelves')} />
      </div>

      <Panel icon="🧒" title="Các bé hôm nay" actions={<Btn small onClick={() => onGo('profiles')}>Quản lý bé →</Btn>}>
        {profiles.loading ? <Spinner /> : null}

        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}
        >
          {profiles.data?.profiles.map((p) => (
            <div key={p.id} className="rounded-xl p-4" style={{ background: 'var(--card)' }}>
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="grid place-items-center rounded-full"
                  style={{ width: 40, height: 40, fontSize: 24, background: p.color }}
                  aria-hidden="true"
                >
                  {p.avatar}
                </span>
                <div>
                  <p className="font-bold">{p.name}</p>
                  <p className="text-xs" style={{ color: p.quota.allowed ? C.ok : C.danger }}>
                    {p.quota.allowed ? '● đang được xem' : '● đang bị chặn'}
                  </p>
                </div>
              </div>

              <p className="text-sm">
                Hôm nay: <b className="tabular-nums">{formatMinutes(p.quota.dailyUsedSec)}</b>
                {p.quota.dailyLimitSec > 0 ? (
                  <span style={{ color: 'var(--text-dim)' }}>
                    {' '}
                    / {formatMinutes(p.quota.dailyLimitSec)}
                  </span>
                ) : null}
              </p>

              {p.quota.dailyLimitSec > 0 ? (
                <div
                  className="mt-2 overflow-hidden rounded-full"
                  style={{ height: 7, background: 'var(--bg)' }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, (p.quota.dailyUsedSec / p.quota.dailyLimitSec) * 100)}%`,
                      background: p.quota.warning ? C.warn : C.ok,
                    }}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Panel>

      <Panel icon="💾" title="Tải offline" actions={<Btn small onClick={() => onGo('downloads')}>Chi tiết →</Btn>}>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span>
            Dung lượng: <b>{formatBytes(s?.storageUsedBytes)}</b> ({s?.storageFileCount} file)
          </span>
          {s && s.downloadQueued > 0 ? (
            <Badge color={C.info}>{s.downloadQueued} đang chờ tải</Badge>
          ) : null}
          {s && s.downloadErrors > 0 ? (
            <Badge color={C.danger}>{s.downloadErrors} lỗi</Badge>
          ) : null}
          {s && s.downloadQueued === 0 && s.downloadErrors === 0 ? (
            <span style={{ color: 'var(--text-dim)' }}>Hàng đợi rỗng</span>
          ) : null}
        </div>
      </Panel>

      {pinIsDefault ? <Alert kind="error">Hãy đổi PIN mặc định!</Alert> : null}
    </>
  )
}

function Stat({
  label,
  value,
  color,
  onClick,
}: {
  label: string
  value: number
  color: string
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-2xl p-4 text-left"
      style={{ background: 'var(--panel)', border: '1px solid var(--panel-border)' }}
    >
      <p className="text-3xl font-extrabold tabular-nums" style={{ color }}>
        {value}
      </p>
      <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
        {label}
      </p>
    </button>
  )
}
