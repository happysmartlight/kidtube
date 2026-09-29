import { useEffect, useState } from 'react'
import { adminApi } from '@/lib/api'
import { C } from '@/lib/color'
import { formatBytes, formatMinutes } from '@/lib/format'
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

const TABS: Array<{ id: Tab; label: string; emoji: string }> = [
  { id: 'dashboard', label: 'Tổng quan', emoji: '📊' },
  { id: 'sources', label: 'Nguồn', emoji: '📡' },
  { id: 'review', label: 'Hàng chờ duyệt', emoji: '⏳' },
  { id: 'shelves', label: 'Kệ', emoji: '🗂' },
  { id: 'profiles', label: 'Bé', emoji: '🧒' },
  { id: 'downloads', label: 'Tải offline', emoji: '⬇' },
  { id: 'reports', label: 'Báo cáo', emoji: '📈' },
  { id: 'settings', label: 'Cài đặt', emoji: '⚙' },
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

  return (
    <div data-admin className="flex h-full flex-col" style={{ background: 'var(--bg)' }}>
      <header
        className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-3"
        style={{ background: 'var(--bg-elev)', borderBottom: '1px solid var(--card)' }}
      >
        <h1 className="mr-2 text-lg font-extrabold">
          <span aria-hidden="true">🧸</span> KidTube — Bố mẹ
        </h1>

        <nav className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <Btn
              key={t.id}
              small
              variant={tab === t.id ? 'primary' : 'ghost'}
              onClick={() => setTab(t.id)}
            >
              {t.emoji} {t.label}
              {t.id === 'review' && pendingCount !== null && pendingCount > 0
                ? ` (${pendingCount})`
                : ''}
            </Btn>
          ))}
        </nav>

        <div className="flex-1" />

        <Btn
          small
          onClick={() => {
            void adminApi.logout().finally(onExit)
          }}
        >
          🚪 Thoát về giao diện của con
        </Btn>
      </header>

      <main className="scroll-y min-h-0 flex-1 p-4">
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
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
        <Stat label="Nguồn" value={s?.sourceCount ?? 0} color={C.focus} onClick={() => onGo('sources')} />
        <Stat label="Kệ" value={s?.shelfCount ?? 0} color="#a78bfa" onClick={() => onGo('shelves')} />
      </div>

      <Panel title="Các bé hôm nay" actions={<Btn small onClick={() => onGo('profiles')}>Quản lý bé →</Btn>}>
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

      <Panel title="Tải offline" actions={<Btn small onClick={() => onGo('downloads')}>Chi tiết →</Btn>}>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span>
            Dung lượng: <b>{formatBytes(s?.storageUsedBytes)}</b> ({s?.storageFileCount} file)
          </span>
          {s && s.downloadQueued > 0 ? (
            <Badge color={C.focus}>{s.downloadQueued} đang chờ tải</Badge>
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
      style={{ background: 'var(--bg-elev)', border: '1px solid var(--card)' }}
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
