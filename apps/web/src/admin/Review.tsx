import { useCallback, useEffect, useState } from 'react'
import { adminApi, type AdminVideo, ApiError } from '@/lib/api'
import { formatDateShort, formatDuration, statusLabel } from '@/lib/format'
import { useDebounced } from '@/lib/useDebounced'
import { Alert, Badge, Btn, Input, Panel, Select, toast, useLoad } from './ui'
import { Spinner } from '@/ui/Spinner'
import { C } from '@/lib/color'

type Tab = 'pending' | 'approved' | 'rejected' | 'later'

/** Moi trang lay bao nhieu video. Bam "Tai them" de lay trang tiep. */
const PAGE = 120

const TABS: Array<{ id: Tab; label: string; emoji: string }> = [
  { id: 'pending', label: 'Chờ duyệt', emoji: '⏳' },
  { id: 'approved', label: 'Đã duyệt', emoji: '✅' },
  { id: 'later', label: 'Để sau', emoji: '🔁' },
  { id: 'rejected', label: 'Đã loại', emoji: '❌' },
]

/**
 * Hang cho duyet — day la noi bo me dung nhieu thoi gian nhat.
 *
 * Toi uu cho THAO TAC NHANH: thumbnail to de nhan dien bang mat,
 * chon nhieu bang checkbox, duyet ca lo bang mot nut, va co the gan
 * thang vao ke ngay khi duyet (khong phai sang tab khac).
 */
export function Review(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('pending')
  const [q, setQ] = useState('')
  // Tim kiem realtime: go la tim, khong phai bam Enter. Debounce de khong
  // ban mot request moi ky tu.
  const search = useDebounced(q, 250)
  const [sort, setSort] = useState('newest')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [targetShelf, setTargetShelf] = useState<number | ''>('')

  // Cac trang tai them, noi vao sau trang dau.
  const [extra, setExtra] = useState<AdminVideo[]>([])
  const [loadingMore, setLoadingMore] = useState(false)

  const videos = useLoad(
    () => adminApi.videos({ status: tab, q: search, sort, limit: PAGE }),
    [tab, search, sort],
  )
  const shelves = useLoad(() => adminApi.shelves())

  // Doi tab/tu khoa/thu tu thi bo chon va bo cac trang da tai —
  // tranh duyet nham video o tab truoc.
  useEffect(() => {
    setSelected(new Set())
    setExtra([])
  }, [tab, search, sort])

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const list = [...(videos.data?.videos ?? []), ...extra]
  const counts = videos.data?.counts ?? {}
  const total = videos.data?.total ?? 0
  const hasMore = list.length < total

  async function loadMore(): Promise<void> {
    setLoadingMore(true)
    try {
      const r = await adminApi.videos({
        status: tab,
        q: search,
        sort,
        limit: PAGE,
        offset: list.length,
      })
      setExtra((prev) => [...prev, ...r.videos])
    } catch {
      toast('error', 'Không tải thêm được')
    } finally {
      setLoadingMore(false)
    }
  }

  // Video da duyet nhung kenh chan nhung VA chua co ban offline ->
  // tre khong thay duoc, phai tai ve moi xem duoc.
  const blockedList =
    tab === 'approved' ? list.filter((v) => v.embeddable === 0 && !v.local_path) : []

  async function review(status: Tab, ids: number[]): Promise<void> {
    if (ids.length === 0) return
    setBusy(true)
    try {
      await adminApi.bulkReview(ids, status)

      // Gan thang vao ke ngay khi duyet — tiet kiem mot vong sang tab Ke.
      // Nho: `approved` mot minh CHUA du de tre thay video (hai tang cua).
      if (status === 'approved' && targetShelf !== '') {
        const r = await adminApi.addToShelf(Number(targetShelf), ids)
        toast('ok', `Đã duyệt ${ids.length} video và thêm ${r.added} vào kệ`)
      } else {
        toast('ok', `Đã chuyển ${ids.length} video sang "${statusLabel(status)}"`)
      }

      setSelected(new Set())
      videos.reload()
      shelves.reload()
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Không cập nhật được')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Xep hang tai offline. Dung chung cho nut tren tung the va nut hang loat —
   * bo me khong can biet video co bi chan nhung hay khong moi tai duoc.
   */
  async function download(ids: number[], priority = 0): Promise<void> {
    if (ids.length === 0) return
    setBusy(true)
    try {
      const r = await adminApi.enqueueDownloads(ids, priority)
      const queued = r.results.filter((x) => x.queued).length
      if (queued > 0) {
        toast('ok', `Đã xếp hàng tải ${queued} video — xem tiến độ ở tab Tải offline`)
      } else {
        // Ly do hay gap nhat: da co ban tai roi.
        toast('error', r.results[0]?.reason ?? 'Không xếp hàng được video nào')
      }
      if (r.notice) toast('error', r.notice)
      videos.reload()
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Không xếp hàng được')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Panel>
        <div className="mb-4 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Btn
              key={t.id}
              variant={tab === t.id ? 'primary' : 'ghost'}
              onClick={() => setTab(t.id)}
            >
              {t.emoji} {t.label}
              {counts[t.id] !== undefined ? ` (${counts[t.id]})` : ''}
            </Btn>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo tiêu đề hoặc tên kênh — gõ không dấu cũng được…"
            aria-label="Tìm video"
            style={{ flex: '1 1 220px' }}
          />
          {q ? (
            <Btn onClick={() => setQ('')} aria-label="Bỏ tìm">
              ✕ Bỏ tìm
            </Btn>
          ) : null}

          <Select value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 'auto' }}>
            <option value="newest">Mới nhất</option>
            <option value="oldest">Cũ nhất</option>
            <option value="longest">Dài nhất</option>
            <option value="shortest">Ngắn nhất</option>
          </Select>
        </div>
      </Panel>

      {/* Thanh thao tac hang loat — chi hien khi da chon */}
      {selected.size > 0 ? (
        <div
          className="sticky top-0 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-2xl p-4"
          style={{
            background: 'var(--bg-elev)',
            border: '2px solid var(--focus)',
            boxShadow: '0 8px 28px -10px rgba(0,0,0,0.65)',
          }}
        >
          <span className="font-extrabold">Đã chọn {selected.size} video</span>

          <div className="flex-1" />

          <Select
            value={targetShelf}
            onChange={(e) => setTargetShelf(e.target.value === '' ? '' : Number(e.target.value))}
            style={{ width: 'auto', minWidth: 190 }}
            aria-label="Kệ để thêm vào khi duyệt"
          >
            <option value="">— Duyệt, chưa xếp kệ —</option>
            {shelves.data?.shelves.map((s) => (
              <option key={s.id} value={s.id}>
                {s.emoji} {s.title}
              </option>
            ))}
          </Select>

          <Btn variant="ok" disabled={busy} onClick={() => void review('approved', [...selected])}>
            ✅ Duyệt
          </Btn>
          <Btn disabled={busy} onClick={() => void review('later', [...selected])}>
            🔁 Để sau
          </Btn>
          <Btn variant="danger" disabled={busy} onClick={() => void review('rejected', [...selected])}>
            ❌ Loại
          </Btn>
          <Btn
            disabled={busy}
            title="Tải sẵn file mp4 về máy. Cần bật Cài đặt → Tải video về máy."
            onClick={() => void download([...selected])}
          >
            ⬇ Tải offline
          </Btn>
          <Btn small onClick={() => setSelected(new Set())}>
            Bỏ chọn
          </Btn>
        </div>
      ) : null}

      <Panel
        title={
          search
            ? `${statusLabel(tab)} — khớp ${total} video, đang xem ${list.length}`
            : `${statusLabel(tab)} — ${total} video, đang xem ${list.length}`
        }
        actions={
          list.length > 0 ? (
            <>
              <Btn small onClick={() => setSelected(new Set(list.map((v) => v.id)))}>
                Chọn tất cả ({list.length})
              </Btn>
              <Btn small onClick={videos.reload}>
                🔄
              </Btn>
            </>
          ) : null
        }
      >
        {videos.loading ? <Spinner /> : null}
        {videos.error ? <Alert kind="error">{videos.error}</Alert> : null}

        {!videos.loading && list.length === 0 ? (
          <p style={{ color: 'var(--text-dim)' }}>
            {tab === 'pending'
              ? 'Không có video nào đang chờ. Thêm nguồn hoặc bấm "Kéo ngay" ở tab Nguồn.'
              : 'Không có video nào ở đây.'}
          </p>
        ) : null}

        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}
        >
          {list.map((v) => {
            const isSel = selected.has(v.id)
            return (
              <div
                key={v.id}
                className="overflow-hidden rounded-xl transition-all"
                style={{
                  background: 'var(--card)',
                  outline: isSel ? '3px solid var(--focus)' : 'none',
                  outlineOffset: -1,
                }}
              >
                <button
                  type="button"
                  className="relative block w-full cursor-pointer border-0 p-0"
                  style={{ background: 'var(--card-hi)', aspectRatio: '16/9' }}
                  onClick={() => toggle(v.id)}
                  aria-pressed={isSel}
                  aria-label={`${isSel ? 'Bỏ chọn' : 'Chọn'}: ${v.title}`}
                >
                  {v.thumbnail ? (
                    <img
                      src={v.thumbnail}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : null}

                  <span
                    className="absolute top-2 left-2 grid place-items-center rounded-lg text-sm font-extrabold"
                    style={{
                      width: 28,
                      height: 28,
                      background: isSel ? 'var(--focus)' : 'rgba(0,0,0,0.6)',
                      color: isSel ? '#2a1f00' : '#fff',
                    }}
                    aria-hidden="true"
                  >
                    {isSel ? '✓' : ''}
                  </span>

                  {v.duration_sec ? (
                    <span
                      className="absolute right-2 bottom-2 rounded px-1.5 py-0.5 text-xs font-bold tabular-nums"
                      style={{ background: 'rgba(0,0,0,0.78)' }}
                    >
                      {formatDuration(v.duration_sec)}
                    </span>
                  ) : (
                    <span
                      className="absolute right-2 bottom-2 rounded px-1.5 py-0.5 text-xs font-bold"
                      style={{ background: 'rgba(0,0,0,0.78)', color: 'var(--text-dim)' }}
                      title="Chưa biết thời lượng — RSS không cung cấp. Bộ lọc theo độ dài sẽ bỏ qua video này."
                    >
                      ?
                    </span>
                  )}
                </button>

                <div className="p-3">
                  <p
                    className="mb-2 text-sm leading-snug font-bold"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                    title={v.title}
                  >
                    {v.title}
                  </p>

                  <div
                    className="mb-2.5 flex flex-wrap items-center gap-1.5 text-xs"
                    style={{ color: 'var(--text-dim)' }}
                  >
                    {v.shelf_count > 0 ? (
                      <Badge color={C.ok}>trong {v.shelf_count} kệ</Badge>
                    ) : v.status === 'approved' ? (
                      <Badge color={C.warn}>chưa xếp kệ</Badge>
                    ) : null}
                    {v.local_path ? <Badge color={C.ok}>⬇ đã tải</Badge> : null}
                    {!v.local_path && v.download_status === 'queued' ? (
                      <Badge color={C.dim}>⏳ chờ tải</Badge>
                    ) : null}
                    {v.download_status === 'downloading' ? (
                      <Badge color={C.focus}>⬇ đang tải</Badge>
                    ) : null}
                    {v.download_status === 'error' ? (
                      <Badge color={C.danger}>⬇ tải lỗi</Badge>
                    ) : null}
                    {v.embeddable === 0 && !v.local_path ? (
                      <Badge color={C.danger}>🙈 kênh chặn nhúng</Badge>
                    ) : null}
                    {v.is_live === 1 ? <Badge color={C.danger}>LIVE</Badge> : null}
                    <span>{formatDateShort(v.published_at ?? v.added_at)}</span>
                  </div>

                  {v.reject_reason ? (
                    <p className="mb-2 text-xs" style={{ color: 'var(--danger)' }}>
                      {v.reject_reason}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-1.5">
                    {v.status !== 'approved' ? (
                      <Btn small variant="ok" onClick={() => void review('approved', [v.id])}>
                        ✅
                      </Btn>
                    ) : null}
                    {v.status !== 'later' ? (
                      <Btn small onClick={() => void review('later', [v.id])}>
                        🔁
                      </Btn>
                    ) : null}
                    {v.status !== 'rejected' ? (
                      <Btn small variant="danger" onClick={() => void review('rejected', [v.id])}>
                        ❌
                      </Btn>
                    ) : null}
                    {!v.local_path && v.download_status !== 'downloading' ? (
                      <Btn
                        small
                        disabled={busy}
                        title={
                          v.download_status === 'queued'
                            ? 'Đã nằm trong hàng đợi tải'
                            : 'Tải file mp4 về máy để xem offline'
                        }
                        onClick={() => void download([v.id])}
                      >
                        {v.download_status === 'error' ? '⬇ thử lại' : '⬇'}
                      </Btn>
                    ) : null}
                    <a
                      href={`https://www.youtube.com/watch?v=${v.youtube_id}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center rounded-xl px-3 py-1.5 text-xs font-bold no-underline"
                      style={{
                        background: 'var(--card-hi)',
                        color: 'var(--text-dim)',
                      }}
                      title="Mở trên YouTube để xem trước"
                    >
                      ↗ Xem
                    </a>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {hasMore ? (
          <div className="mt-4 flex items-center justify-center gap-3">
            <Btn onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? 'Đang tải…' : `⬇ Tải thêm ${Math.min(PAGE, total - list.length)} video`}
            </Btn>
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
              còn {total - list.length} video nữa
            </span>
          </div>
        ) : null}
      </Panel>

      {/* Thong tin ve hai tang cua — bo me hay quen buoc thu hai */}
      {tab === 'approved' && list.some((v) => v.shelf_count === 0) ? (
        <Alert kind="warn">
          Một số video đã duyệt nhưng <b>chưa xếp vào kệ nào</b>, nên con vẫn chưa thấy chúng.
          Chọn các video đó rồi chọn kệ ở thanh phía trên, hoặc sang tab <b>Kệ</b> để xếp.
        </Alert>
      ) : null}

      {/* Kenh chan nhung — van de rat pho bien voi kenh tre em lon */}
      {blockedList.length > 0 ? (
        <Panel title={`🙈 ${blockedList.length} video bị kênh chặn nhúng`}>
          <Alert kind="warn">
            Các kênh lớn như Cocomelon <b>không cho nhúng video ra ngoài YouTube</b>. Những video
            này <b>đã được ẩn khỏi giao diện của con</b> để bé không bấm vào rồi gặp màn hình lỗi.
            <br />
            <b>Cách khắc phục duy nhất:</b> tải bản offline về máy — file mp4 phát trực tiếp thì
            không cần nhúng. Cần bật <b>Cài đặt → Tải video về máy</b> trước.
          </Alert>

          <Btn
            variant="primary"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void adminApi
                .enqueueDownloads(
                  blockedList.map((v) => v.id),
                  10,
                )
                .then((r) => {
                  const n = r.results.filter((x) => x.queued).length
                  toast('ok', `Đã xếp hàng tải ${n} video`)
                  if (r.notice) toast('error', r.notice)
                  videos.reload()
                })
                .catch(() => toast('error', 'Không xếp hàng được'))
                .finally(() => setBusy(false))
            }}
          >
            ⬇ Tải offline {blockedList.length} video này
          </Btn>

          <div className="mt-3 flex flex-col gap-1.5">
            {blockedList.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-2.5 rounded-lg p-2 text-sm"
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
                <span className="min-w-0 flex-1 truncate">{v.title}</span>
                <Badge color={C.dim}>{v.download_status}</Badge>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </>
  )
}
