import { useState } from 'react'
import { adminApi, ApiError, type IngestResult, type SourcePreview } from '@/lib/api'
import { formatRelative, sourceTypeLabel } from '@/lib/format'
import { Alert, Badge, Btn, Field, Input, Panel, toast, Toggle, useLoad } from './ui'
import { Spinner } from '@/ui/Spinner'
import { C } from '@/lib/color'

export function Sources(): React.ReactElement {
  const { data, loading, error, reload } = useLoad(() => adminApi.sources())

  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState<SourcePreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [autoApprove, setAutoApprove] = useState(false)
  const [lastIngest, setLastIngest] = useState<IngestResult | null>(null)

  async function doPreview(): Promise<void> {
    setPreviewing(true)
    setPreviewError(null)
    setPreview(null)
    try {
      setPreview(await adminApi.previewSource(url))
    } catch (err) {
      setPreviewError(err instanceof ApiError ? err.message : 'Không xem trước được')
    } finally {
      setPreviewing(false)
    }
  }

  async function doAdd(): Promise<void> {
    setAdding(true)
    try {
      const res = await adminApi.addSource(url, { autoApprove })
      toast('ok', `Đã thêm "${res.source.title}"`)
      setLastIngest(res.ingest)
      setUrl('')
      setPreview(null)
      setAutoApprove(false)
      reload()
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Không thêm được nguồn')
    } finally {
      setAdding(false)
    }
  }

  return (
    <>
      <Panel
        title="Thêm nguồn"
        subtitle="Dán link kênh, playlist hoặc video lẻ — hệ thống tự nhận diện"
      >
        <Field
          label="Link YouTube"
          hint="Nhận được: youtube.com/@handle · /channel/UC… · /c/… · /user/… · /playlist?list=… · /watch?v=… · youtu.be/… · /shorts/… · hoặc dán thẳng mã kênh UC…"
        >
          <div className="flex flex-wrap gap-2">
            <Input
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                setPreview(null)
                setPreviewError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && url.trim() && !previewing) void doPreview()
              }}
              placeholder="https://www.youtube.com/@tenkenh"
              style={{ flex: '1 1 280px' }}
              spellCheck={false}
              autoComplete="off"
            />
            <Btn onClick={() => void doPreview()} disabled={!url.trim() || previewing}>
              {previewing ? 'Đang kiểm tra…' : '🔍 Xem trước'}
            </Btn>
          </div>
        </Field>

        {previewError ? <Alert kind="error">{previewError}</Alert> : null}

        {preview ? (
          <div className="rounded-xl p-4" style={{ background: 'var(--card)' }}>
            <div className="mb-3 flex items-start gap-3">
              {preview.resolved.thumbnail ? (
                <img
                  src={preview.resolved.thumbnail}
                  alt=""
                  className="shrink-0 rounded-lg object-cover"
                  style={{ width: 96, height: 54 }}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge color={C.focus}>{sourceTypeLabel(preview.resolved.type)}</Badge>
                  <code className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    {preview.resolved.externalId}
                  </code>
                </div>
                <p className="font-bold">{preview.resolved.title}</p>
                <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                  Xem trước thấy {preview.sampleCount} video
                </p>
              </div>
            </div>

            {preview.notes.map((n) => (
              <Alert key={n} kind="info">
                {n}
              </Alert>
            ))}

            {preview.alreadyExists ? (
              <Alert kind="warn">
                Nguồn này đã có trong danh sách: <b>{preview.alreadyExists.title}</b>
              </Alert>
            ) : (
              <>
                <Toggle
                  checked={autoApprove}
                  onChange={setAutoApprove}
                  label="Tự động duyệt video mới của nguồn này"
                  hint="KHÔNG khuyến nghị. Bật cái này nghĩa là video mới của kênh sẽ hiện ngay cho con mà bố mẹ chưa xem qua — trái với nguyên tắc chính của app."
                />
                <Btn variant="primary" onClick={() => void doAdd()} disabled={adding}>
                  {adding ? 'Đang thêm và kéo video…' : '➕ Thêm nguồn này'}
                </Btn>
              </>
            )}
          </div>
        ) : null}

        {lastIngest ? (
          <div className="mt-4">
            <Alert kind="ok">
              Đã kéo {lastIngest.fetched} video: <b>{lastIngest.added} mới</b>
              {lastIngest.autoRejected > 0 ? `, ${lastIngest.autoRejected} bị bộ lọc loại` : ''}
              {lastIngest.via.length > 0 ? ` (qua ${lastIngest.via.join(' → ')})` : ''}. Mở tab{' '}
              <b>Hàng chờ duyệt</b> để xem.
            </Alert>
            {lastIngest.warnings.map((w) => (
              <Alert key={w} kind="warn">
                {w}
              </Alert>
            ))}
          </div>
        ) : null}
      </Panel>

      <Panel
        title="Nguồn đã thêm"
        subtitle={data ? `${data.sources.length} nguồn` : undefined}
        actions={<Btn small onClick={reload}>🔄 Tải lại</Btn>}
      >
        {loading ? <Spinner /> : null}
        {error ? <Alert kind="error">{error}</Alert> : null}

        {data && data.sources.length === 0 ? (
          <p style={{ color: 'var(--text-dim)' }}>
            Chưa có nguồn nào. Dán link ở khung phía trên để bắt đầu.
          </p>
        ) : null}

        <div className="flex flex-col gap-2.5">
          {data?.sources.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center gap-3 rounded-xl p-3"
              style={{ background: 'var(--card)', opacity: s.is_active ? 1 : 0.55 }}
            >
              {s.thumbnail ? (
                <img
                  src={s.thumbnail}
                  alt=""
                  className="shrink-0 rounded-lg object-cover"
                  style={{ width: 72, height: 40 }}
                />
              ) : (
                <div
                  className="grid shrink-0 place-items-center rounded-lg"
                  style={{ width: 72, height: 40, background: 'var(--card-hi)', fontSize: 20 }}
                  aria-hidden="true"
                >
                  {s.type === 'channel' ? '📺' : s.type === 'playlist' ? '📋' : '🎬'}
                </div>
              )}

              <div className="min-w-0 flex-1" style={{ flexBasis: 220 }}>
                <p className="truncate font-bold">{s.title}</p>
                <div
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
                  style={{ color: 'var(--text-dim)' }}
                >
                  <span>{sourceTypeLabel(s.type)}</span>
                  <span>{s.video_count} video</span>
                  {s.pending_count > 0 ? (
                    <Badge color={C.focus}>{s.pending_count} chờ duyệt</Badge>
                  ) : null}
                  <span>kéo {formatRelative(s.last_pulled_at)}</span>
                </div>
                {s.last_error ? (
                  <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>
                    Lỗi lần kéo gần nhất: {s.last_error}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label
                  className="flex cursor-pointer items-center gap-1.5 text-xs"
                  title="Tự động kiểm tra video mới theo chu kỳ"
                >
                  <input
                    type="checkbox"
                    checked={s.auto_pull === 1}
                    onChange={(e) => {
                      void adminApi
                        .updateSource(s.id, { autoPull: e.target.checked })
                        .then(reload)
                        .catch(() => toast('error', 'Không đổi được'))
                    }}
                  />
                  tự kéo
                </label>

                <Btn
                  small
                  onClick={() => {
                    toast('info', 'Đang kéo…')
                    void adminApi
                      .pullSource(s.id)
                      .then((r) => {
                        toast(
                          'ok',
                          `Kéo xong: ${r.result.added} video mới${
                            r.result.autoRejected > 0 ? `, ${r.result.autoRejected} bị loại` : ''
                          }`,
                        )
                        reload()
                      })
                      .catch((err: unknown) =>
                        toast('error', err instanceof ApiError ? err.message : 'Kéo thất bại'),
                      )
                  }}
                >
                  ⬇ Kéo ngay
                </Btn>

                <Btn
                  small
                  title="Lấy toàn bộ lịch sử kênh (cần yt-dlp hoặc API key)"
                  onClick={() => {
                    toast('info', 'Đang kéo toàn bộ lịch sử…')
                    void adminApi
                      .pullSource(s.id, true)
                      .then((r) => {
                        toast('ok', `Kéo xong: ${r.result.added} video mới`)
                        if (r.result.warnings.length > 0) toast('info', r.result.warnings[0]!)
                        reload()
                      })
                      .catch((err: unknown) =>
                        toast('error', err instanceof ApiError ? err.message : 'Kéo thất bại'),
                      )
                  }}
                >
                  📚 Toàn bộ
                </Btn>

                <Btn
                  small
                  variant="danger"
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Xoá nguồn "${s.title}"?\n\n` +
                          `${s.video_count} video đã kéo về sẽ được GIỮ LẠI ` +
                          '(để không làm mất nội dung con đang xem).',
                      )
                    ) {
                      return
                    }
                    void adminApi
                      .deleteSource(s.id)
                      .then(() => {
                        toast('ok', 'Đã xoá nguồn')
                        reload()
                      })
                      .catch(() => toast('error', 'Không xoá được'))
                  }}
                >
                  🗑
                </Btn>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </>
  )
}
