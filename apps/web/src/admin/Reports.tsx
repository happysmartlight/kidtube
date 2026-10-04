import { adminApi } from '@/lib/api'
import { C } from '@/lib/color'
import { formatDate, formatMinutes } from '@/lib/format'
import { Spinner } from '@/ui/Spinner'
import { Alert, Badge, Btn, Panel, useLoad } from './ui'

export function Reports(): React.ReactElement {
  const days = useLoad(() => adminApi.statsDays(14))
  const top = useLoad(() => adminApi.statsTop(10))
  const history = useLoad(() => adminApi.statsHistory(60))
  const today = useLoad(() => adminApi.stats())

  const maxSec = Math.max(1, ...(days.data?.days ?? []).map((d) => d.seconds))

  return (
    <>
      <Panel icon="📅" title="Hôm nay" actions={<Btn small onClick={today.reload}>🔄</Btn>}>
        {today.loading ? <Spinner /> : null}
        {today.data && today.data.todayByProfile.length === 0 ? (
          <p style={{ color: 'var(--text-dim)' }}>Hôm nay chưa bé nào xem gì.</p>
        ) : null}

        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}
        >
          {today.data?.todayByProfile.map((p) => (
            <div key={p.profileId} className="rounded-xl p-4" style={{ background: 'var(--card)' }}>
              <div className="mb-1 flex items-center gap-2">
                <span style={{ fontSize: 26 }} aria-hidden="true">
                  {p.avatar}
                </span>
                <span className="font-bold">{p.profileName}</span>
              </div>
              <p className="text-2xl font-extrabold tabular-nums">{formatMinutes(p.seconds)}</p>
              <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                {p.videos} video đã xem hết
              </p>
            </div>
          ))}
        </div>
      </Panel>

      {/* Bieu do cot 14 ngay — de bo me thay xu huong, khong chi con so hom nay */}
      <Panel icon="📈" title="14 ngày gần nhất" subtitle="Tổng thời gian xem mỗi ngày (mọi bé)">
        {days.loading ? <Spinner /> : null}

        {days.data && days.data.days.length === 0 ? (
          <p style={{ color: 'var(--text-dim)' }}>Chưa có dữ liệu.</p>
        ) : (
          <div className="flex items-end gap-1.5" style={{ height: 150 }}>
            {days.data?.days.map((d) => {
              const h = Math.max(3, (d.seconds / maxSec) * 130)
              const label = d.day.slice(5).replace('-', '/')
              return (
                <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <span
                    className="text-xs font-bold tabular-nums"
                    style={{ color: 'var(--text-dim)', fontSize: 10 }}
                  >
                    {Math.round(d.seconds / 60)}
                  </span>
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: h,
                      background: d.seconds >= maxSec * 0.85 ? C.warn : C.ok,
                      minWidth: 8,
                    }}
                    title={`${label}: ${formatMinutes(d.seconds)}, ${d.videos} video`}
                  />
                  <span
                    className="truncate text-xs"
                    style={{ color: 'var(--text-dim)', fontSize: 10 }}
                  >
                    {label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Panel>

      <Panel icon="🏆" title="Video con xem nhiều nhất">
        {top.loading ? <Spinner /> : null}
        {top.data && top.data.videos.length === 0 ? (
          <p style={{ color: 'var(--text-dim)' }}>Chưa có dữ liệu.</p>
        ) : null}

        <div className="flex flex-col gap-1.5">
          {top.data?.videos.map((v, i) => (
            <div
              key={v.videoId}
              className="flex items-center gap-2.5 rounded-lg p-2"
              style={{ background: 'var(--card)' }}
            >
              <span
                className="w-6 shrink-0 text-center font-extrabold tabular-nums"
                style={{ color: 'var(--text-dim)' }}
              >
                {i + 1}
              </span>
              {v.thumbnail ? (
                <img
                  src={v.thumbnail}
                  alt=""
                  loading="lazy"
                  className="shrink-0 rounded object-cover"
                  style={{ width: 64, height: 36 }}
                />
              ) : null}
              <span className="min-w-0 flex-1 truncate text-sm">{v.title}</span>
              <Badge color={C.info}>{v.plays} lần</Badge>
              <span className="shrink-0 text-xs tabular-nums" style={{ color: 'var(--text-dim)' }}>
                {formatMinutes(v.seconds)}
              </span>
            </div>
          ))}
        </div>

        <Alert kind="info">
          Video bé xem lại nhiều lần là ứng viên tốt để <b>tải về máy</b> — load tức thì và không
          quảng cáo.
        </Alert>
      </Panel>

      <Panel icon="📝" title="Nhật ký xem" actions={<Btn small onClick={history.reload}>🔄</Btn>}>
        {history.loading ? <Spinner /> : null}
        {history.data && history.data.entries.length === 0 ? (
          <p style={{ color: 'var(--text-dim)' }}>Chưa có lượt xem nào.</p>
        ) : null}

        <div className="flex flex-col gap-1" style={{ maxHeight: 460, overflowY: 'auto' }}>
          {history.data?.entries.map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap items-center gap-2.5 rounded-lg p-2 text-sm"
              style={{ background: 'var(--card)' }}
            >
              <span style={{ fontSize: 20 }} aria-hidden="true" title={e.profileName}>
                {e.avatar}
              </span>
              <span className="min-w-0 flex-1 truncate" style={{ flexBasis: 200 }}>
                {e.title}
              </span>
              <span className="shrink-0 text-xs tabular-nums" style={{ color: 'var(--text-dim)' }}>
                {formatMinutes(e.secondsWatched)}
              </span>
              {e.completed === 1 ? (
                <Badge color={C.ok}>xem hết</Badge>
              ) : (
                <Badge color={C.dim}>bỏ giữa</Badge>
              )}
              <span className="shrink-0 text-xs" style={{ color: 'var(--text-dim)' }}>
                {formatDate(e.startedAt)}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </>
  )
}
