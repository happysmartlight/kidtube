import { useEffect } from 'react'
import { adminApi } from '@/lib/api'
import { C } from '@/lib/color'
import { formatBytes } from '@/lib/format'
import { Spinner } from '@/ui/Spinner'
import { Alert, Badge, Btn, Panel, toast, useLoad } from './ui'

export function Downloads(): React.ReactElement {
  const { data, loading, error, reload } = useLoad(() => adminApi.downloads())

  // Tu lam moi khi co job dang chay — de bo me thay tien do nhich len.
  const running = data?.queue.some((q) => q.status === 'running') ?? false
  useEffect(() => {
    if (!running) return
    const t = window.setInterval(reload, 2000)
    return () => window.clearInterval(t)
  }, [running, reload])

  const storage = data?.storage
  const pct =
    storage && storage.limitBytes > 0
      ? Math.min(100, (storage.usedBytes / storage.limitBytes) * 100)
      : 0

  if (loading && !data) return <Spinner />
  if (error) return <Alert kind="error">{error}</Alert>

  return (
    <>
      <Panel
        title="Tình trạng"
        actions={
          <>
            <Btn small onClick={reload}>
              🔄
            </Btn>
            <Btn
              small
              onClick={() => {
                void adminApi
                  .cleanupDownloads()
                  .then((r) => {
                    toast(
                      'ok',
                      `Dọn xong: xoá ${r.orphansRemoved} file rác, giải phóng ${r.evictedForSpace} video`,
                    )
                    reload()
                  })
                  .catch(() => toast('error', 'Dọn thất bại'))
              }}
            >
              🧹 Dọn dẹp
            </Btn>
            <Btn
              small
              onClick={() => {
                void adminApi
                  .enqueueFavorites()
                  .then((r) => {
                    if (r.enqueued > 0) {
                      toast('ok', `Đã xếp hàng ${r.enqueued} video yêu thích`)
                    } else if (r.candidates === 0) {
                      // Phan biet ro "khong co gi de lam" voi "bam ma khong thay gi".
                      toast(
                        'ok',
                        'Không có video yêu thích nào cần tải — con chưa đánh dấu ❤️ video nào, hoặc tất cả đã có bản offline.',
                      )
                    } else {
                      toast('ok', `${r.candidates} video yêu thích đã nằm sẵn trong hàng đợi`)
                    }
                    if (r.notice) toast('error', r.notice)
                    reload()
                  })
                  .catch(() => toast('error', 'Không xếp hàng được'))
              }}
            >
              ❤️ Tải video yêu thích
            </Btn>
          </>
        }
      >
        {!data?.worker.ytdlpAvailable ? (
          <Alert kind="error">
            <b>Không có yt-dlp</b> nên không tải được gì. Nếu chạy bằng Docker thì image đã có sẵn;
            nếu chạy trực tiếp trên máy thì cài yt-dlp và ffmpeg trước.
          </Alert>
        ) : !data.worker.offlineEnabled ? (
          <Alert kind="warn">
            Chế độ tải offline đang <b>TẮT</b>. Hàng đợi sẽ không chạy. Bật ở tab{' '}
            <b>Cài đặt → Tải video về máy</b>.
          </Alert>
        ) : (
          <Alert kind="ok">
            Đang bật. Worker chạy <b>một video một lúc</b> (cố ý — Pi ghi SSD qua USB3, chạy song
            song sẽ nghẽn và ảnh hưởng video đang phát).
          </Alert>
        )}

        <div className="mb-2 flex items-center justify-between text-sm">
          <span style={{ color: 'var(--text-dim)' }}>Dung lượng</span>
          <span className="font-bold tabular-nums">
            {formatBytes(storage?.usedBytes)} / {formatBytes(storage?.limitBytes)} ·{' '}
            {storage?.fileCount} file
          </span>
        </div>
        <div className="overflow-hidden rounded-full" style={{ height: 10, background: 'var(--card)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: pct > 90 ? C.danger : C.ok }}
          />
        </div>
      </Panel>

      <Panel title={`Hàng đợi (${data?.queue.length ?? 0})`}>
        {data && data.queue.length === 0 ? (
          <p style={{ color: 'var(--text-dim)' }}>
            Hàng đợi rỗng. Cách xếp video vào hàng:
            <br />• Sang tab <b>Hàng chờ duyệt</b> (thẻ <b>Đã duyệt</b>), bấm nút <b>⬇</b> ngay
            dưới video — hoặc chọn nhiều video rồi bấm <b>⬇ Tải offline</b> ở thanh phía trên.
            <br />• Hoặc bấm <b>❤️ Tải video yêu thích</b> ở trên để tải tất cả video con đã đánh
            dấu ❤️.
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          {data?.queue.map((q) => (
            <div
              key={q.id}
              className="flex flex-wrap items-center gap-3 rounded-xl p-3"
              style={{ background: 'var(--card)' }}
            >
              {q.thumbnail ? (
                <img
                  src={q.thumbnail}
                  alt=""
                  loading="lazy"
                  className="shrink-0 rounded-lg object-cover"
                  style={{ width: 72, height: 40 }}
                />
              ) : null}

              <div className="min-w-0 flex-1" style={{ flexBasis: 220 }}>
                <p className="truncate text-sm font-bold">{q.title}</p>

                {q.status === 'running' ? (
                  <div className="mt-1.5">
                    <div
                      className="overflow-hidden rounded-full"
                      style={{ height: 6, background: 'var(--bg)' }}
                    >
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${q.progress}%`, background: C.focus }}
                      />
                    </div>
                    <p className="mt-1 text-xs tabular-nums" style={{ color: 'var(--text-dim)' }}>
                      {q.progress.toFixed(1)}%
                    </p>
                  </div>
                ) : (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {q.status === 'queued' ? <Badge color={C.dim}>đang chờ</Badge> : null}
                    {q.status === 'error' ? <Badge color={C.danger}>lỗi</Badge> : null}
                    {q.attempts > 0 ? (
                      <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                        thử {q.attempts} lần
                      </span>
                    ) : null}
                  </div>
                )}

                {q.error ? (
                  <p className="mt-1 text-xs" style={{ color: C.danger, wordBreak: 'break-word' }}>
                    {q.error}
                  </p>
                ) : null}
              </div>

              {q.status !== 'running' ? (
                <Btn
                  small
                  variant="danger"
                  onClick={() => {
                    void adminApi
                      .cancelDownload(q.video_id)
                      .then(reload)
                      .catch(() => toast('error', 'Không huỷ được'))
                  }}
                >
                  ✕ Bỏ
                </Btn>
              ) : (
                <Badge color={C.focus}>đang tải</Badge>
              )}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={`Đã tải về (${data?.downloaded.length ?? 0})`}>
        {data && data.downloaded.length === 0 ? (
          <p style={{ color: 'var(--text-dim)' }}>Chưa có video nào được tải về.</p>
        ) : null}

        <div className="flex flex-col gap-1.5">
          {data?.downloaded.map((v) => (
            <div
              key={v.id}
              className="flex flex-wrap items-center gap-2.5 rounded-lg p-2.5"
              style={{ background: 'var(--card)' }}
            >
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
              <span className="shrink-0 text-xs tabular-nums" style={{ color: 'var(--text-dim)' }}>
                {formatBytes(v.file_size)}
              </span>
              <span className="shrink-0 text-xs" style={{ color: 'var(--text-dim)' }}>
                xem {v.watch_count} lần
              </span>
              <Btn
                small
                variant="danger"
                title="Xoá file đã tải. Video vẫn xem được qua stream YouTube."
                onClick={() => {
                  if (!window.confirm(`Xoá file đã tải của "${v.title}"?\n\nVideo vẫn xem được qua stream.`)) {
                    return
                  }
                  void adminApi
                    .deleteDownloadedFile(v.id)
                    .then(() => {
                      toast('ok', 'Đã xoá file')
                      reload()
                    })
                    .catch(() => toast('error', 'Không xoá được'))
                }}
              >
                🗑
              </Btn>
            </div>
          ))}
        </div>
      </Panel>
    </>
  )
}
