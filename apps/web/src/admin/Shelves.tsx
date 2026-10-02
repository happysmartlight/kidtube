import { useEffect, useState } from 'react'
import { adminApi, type AdminShelf, type AdminVideo, ApiError } from '@/lib/api'
import { C } from '@/lib/color'
import { formatDuration } from '@/lib/format'
import { useDebounced } from '@/lib/useDebounced'
import { Spinner } from '@/ui/Spinner'
import { Alert, Badge, Btn, Field, Input, Panel, Select, toast, useLoad } from './ui'

const PALETTE = ['#ffd23f', '#ff6b8a', '#4ecdc4', '#a78bfa', '#ff9f43', '#4ecb71', '#5b9cff', '#f472b6']
const EMOJIS = ['⭐', '🌟', '🎤', '🔢', '🔭', '🎨', '🐾', '🚗', '🧩', '📚', '🍎', '⚽', '🎬', '🌈']

/**
 * Quan ly ke.
 *
 * Nhac lai HAI TANG CUA: video `approved` van chua hien cho tre neu chua
 * nam trong mot ke dang bat va duoc gan cho be do. Trang nay la tang thu hai.
 */
export function Shelves(): React.ReactElement {
  const shelves = useLoad(() => adminApi.shelves())
  const profiles = useLoad(() => adminApi.profiles())

  const [openId, setOpenId] = useState<number | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newEmoji, setNewEmoji] = useState('⭐')
  const [newColor, setNewColor] = useState(PALETTE[0]!)

  async function create(): Promise<void> {
    if (!newTitle.trim()) return
    try {
      await adminApi.createShelf({ title: newTitle.trim(), emoji: newEmoji, color: newColor })
      toast('ok', 'Đã tạo kệ')
      setNewTitle('')
      shelves.reload()
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Không tạo được kệ')
    }
  }

  async function move(shelf: AdminShelf, dir: -1 | 1): Promise<void> {
    const list = shelves.data?.shelves ?? []
    const idx = list.findIndex((s) => s.id === shelf.id)
    const target = idx + dir
    if (idx < 0 || target < 0 || target >= list.length) return

    const order = list.map((s) => s.id)
    ;[order[idx], order[target]] = [order[target]!, order[idx]!]
    try {
      await adminApi.reorderShelves(order)
      shelves.reload()
    } catch {
      toast('error', 'Không đổi được thứ tự')
    }
  }

  return (
    <>
      <Panel title="Tạo kệ mới" subtitle="Kệ là một hàng ngang trên trang chủ của con">
        <div className="flex flex-wrap items-end gap-3">
          <div style={{ flex: '1 1 220px' }}>
            <Field label="Tên kệ">
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void create()
                }}
                placeholder="VÍ DỤ: BÀI HÁT"
              />
            </Field>
          </div>

          <div>
            <Field label="Biểu tượng">
              <Select
                value={newEmoji}
                onChange={(e) => setNewEmoji(e.target.value)}
                style={{ width: 'auto', minWidth: 80, fontSize: 20 }}
              >
                {EMOJIS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div>
            <Field label="Màu">
              <div className="flex gap-1.5">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    aria-label={`Chọn màu ${c}`}
                    aria-pressed={newColor === c}
                    className="rounded-lg"
                    style={{
                      width: 34,
                      height: 34,
                      background: c,
                      border: newColor === c ? '3px solid var(--text)' : '3px solid transparent',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            </Field>
          </div>

          <Btn variant="primary" onClick={() => void create()} disabled={!newTitle.trim()}>
            ➕ Tạo kệ
          </Btn>
        </div>
      </Panel>

      <Panel
        title="Các kệ"
        subtitle="Thứ tự ở đây chính là thứ tự trên trang chủ của con"
        actions={<Btn small onClick={shelves.reload}>🔄</Btn>}
      >
        {shelves.loading ? <Spinner /> : null}
        {shelves.error ? <Alert kind="error">{shelves.error}</Alert> : null}

        <div className="flex flex-col gap-2.5">
          {shelves.data?.shelves.map((s, i, arr) => (
            <div key={s.id} className="rounded-xl" style={{ background: 'var(--card)' }}>
              <div className="flex flex-wrap items-center gap-3 p-3">
                <span
                  className="grid shrink-0 place-items-center rounded-xl"
                  style={{ width: 44, height: 44, background: s.color, fontSize: 24 }}
                  aria-hidden="true"
                >
                  {s.emoji}
                </span>

                <div className="min-w-0 flex-1" style={{ flexBasis: 180 }}>
                  <p className="truncate font-bold" style={{ color: s.color }}>
                    {s.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-dim)' }}>
                    <span>{s.item_count} video</span>
                    {s.is_active !== 1 ? <Badge color={C.warn}>đang tắt</Badge> : null}
                    {s.profileIds.length === 0 ? (
                      <Badge color={C.ok}>mọi bé</Badge>
                    ) : (
                      <Badge color={C.focus}>
                        chỉ{' '}
                        {s.profileIds
                          .map((id) => profiles.data?.profiles.find((p) => p.id === id)?.name ?? id)
                          .join(', ')}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Btn small onClick={() => void move(s, -1)} disabled={i === 0} aria-label="Lên">
                    ↑
                  </Btn>
                  <Btn
                    small
                    onClick={() => void move(s, 1)}
                    disabled={i === arr.length - 1}
                    aria-label="Xuống"
                  >
                    ↓
                  </Btn>
                  <Btn small onClick={() => setOpenId(openId === s.id ? null : s.id)}>
                    {openId === s.id ? '▲ Đóng' : '▼ Video & cài đặt'}
                  </Btn>
                  <Btn
                    small
                    variant="danger"
                    onClick={() => {
                      if (!window.confirm(`Xoá kệ "${s.title}"? Video không bị xoá, chỉ bỏ khỏi kệ.`)) {
                        return
                      }
                      void adminApi
                        .deleteShelf(s.id)
                        .then(() => {
                          toast('ok', 'Đã xoá kệ')
                          shelves.reload()
                        })
                        .catch(() => toast('error', 'Không xoá được'))
                    }}
                  >
                    🗑
                  </Btn>
                </div>
              </div>

              {openId === s.id ? (
                <ShelfDetail
                  shelf={s}
                  profiles={profiles.data?.profiles ?? []}
                  onChanged={() => {
                    shelves.reload()
                    profiles.reload()
                  }}
                />
              ) : null}
            </div>
          ))}
        </div>
      </Panel>
    </>
  )
}

function ShelfDetail({
  shelf,
  profiles,
  onChanged,
}: {
  shelf: AdminShelf
  profiles: Array<{ id: number; name: string; avatar: string }>
  onChanged: () => void
}): React.ReactElement {
  const items = useLoad(() => adminApi.shelfItems(shelf.id), [shelf.id])
  const [adding, setAdding] = useState(false)

  async function moveItem(videoId: number, dir: -1 | 1): Promise<void> {
    const list = items.data?.items ?? []
    const idx = list.findIndex((v) => v.id === videoId)
    const target = idx + dir
    if (idx < 0 || target < 0 || target >= list.length) return

    const order = list.map((v) => v.id)
    ;[order[idx], order[target]] = [order[target]!, order[idx]!]
    try {
      await adminApi.reorderShelfItems(shelf.id, order)
      items.reload()
    } catch {
      toast('error', 'Không đổi được thứ tự')
    }
  }

  return (
    <div className="p-4" style={{ borderTop: '1px solid var(--card-hi)' }}>
      {/* Gan cho be nao */}
      <p className="mb-2 text-sm font-bold">Kệ này hiện cho bé nào?</p>
      <div className="mb-4 flex flex-wrap gap-2">
        <Btn
          small
          variant={shelf.profileIds.length === 0 ? 'primary' : 'ghost'}
          onClick={() => {
            void adminApi
              .updateShelf(shelf.id, { profileIds: [] })
              .then(onChanged)
              .catch(() => toast('error', 'Không lưu được'))
          }}
        >
          👥 Mọi bé
        </Btn>
        {profiles.map((p) => {
          const on = shelf.profileIds.includes(p.id)
          return (
            <Btn
              key={p.id}
              small
              variant={on ? 'primary' : 'ghost'}
              onClick={() => {
                const next = on
                  ? shelf.profileIds.filter((x) => x !== p.id)
                  : [...shelf.profileIds, p.id]
                void adminApi
                  .updateShelf(shelf.id, { profileIds: next })
                  .then(onChanged)
                  .catch(() => toast('error', 'Không lưu được'))
              }}
            >
              {p.avatar} {p.name}
            </Btn>
          )
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Btn
          small
          variant={shelf.is_active === 1 ? 'ghost' : 'primary'}
          onClick={() => {
            void adminApi
              .updateShelf(shelf.id, { isActive: shelf.is_active !== 1 })
              .then(onChanged)
              .catch(() => toast('error', 'Không lưu được'))
          }}
        >
          {shelf.is_active === 1 ? '⏸ Tắt kệ này' : '▶️ Bật kệ này'}
        </Btn>
        <Btn small onClick={() => setAdding(!adding)}>
          {adding ? '✕ Đóng' : '➕ Thêm video vào kệ'}
        </Btn>
      </div>

      {adding ? (
        <AddVideos
          shelfId={shelf.id}
          onDone={() => {
            setAdding(false)
            items.reload()
            onChanged()
          }}
        />
      ) : null}

      {/* Danh sach video trong ke */}
      <p className="mt-4 mb-2 text-sm font-bold">
        Video trong kệ ({items.data?.items.length ?? 0}) — thứ tự từ trái sang phải
      </p>

      {items.loading ? <Spinner /> : null}
      {items.data && items.data.items.length === 0 ? (
        <Alert kind="warn">
          Kệ này rỗng nên <b>không hiện trên trang chủ của con</b>. Bấm "Thêm video vào kệ".
        </Alert>
      ) : null}

      <div className="flex flex-col gap-1.5">
        {items.data?.items.map((v, i, arr) => (
          <div
            key={v.id}
            className="flex items-center gap-2.5 rounded-lg p-2"
            style={{ background: 'var(--bg-elev)' }}
          >
            <span
              className="w-6 shrink-0 text-center text-xs font-bold tabular-nums"
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
            <span className="shrink-0 text-xs tabular-nums" style={{ color: 'var(--text-dim)' }}>
              {formatDuration(v.duration_sec)}
            </span>
            <Btn small onClick={() => void moveItem(v.id, -1)} disabled={i === 0} aria-label="Lên">
              ↑
            </Btn>
            <Btn
              small
              onClick={() => void moveItem(v.id, 1)}
              disabled={i === arr.length - 1}
              aria-label="Xuống"
            >
              ↓
            </Btn>
            <Btn
              small
              variant="danger"
              aria-label="Bỏ khỏi kệ"
              onClick={() => {
                void adminApi
                  .removeFromShelf(shelf.id, v.id)
                  .then(() => {
                    items.reload()
                    onChanged()
                  })
                  .catch(() => toast('error', 'Không bỏ được'))
              }}
            >
              ✕
            </Btn>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Moi lan bam "Tai them" lay bao nhieu video nua. */
const PAGE = 60

/**
 * Chon video DA DUYET de them vao ke.
 *
 * Hai thu de y:
 *   - Tim kiem REALTIME (debounce 250ms) + bo dau: go "be heo" ra "Bé Heo".
 *     Khong con phai bam Enter hay nut kinh lup.
 *   - PHAN TRANG. Truoc day chi lay 60 video dau roi im lang bo qua phan con
 *     lai — co 1000+ video da duyet thi coi nhu khong thay. Gio co "Tai them"
 *     va hien ro "dang xem X / Y".
 */
function AddVideos({
  shelfId,
  onDone,
}: {
  shelfId: number
  onDone: () => void
}): React.ReactElement {
  const [q, setQ] = useState('')
  const search = useDebounced(q, 250)
  const [sel, setSel] = useState<Set<number>>(new Set())

  // Cac trang da tai, noi lai. Reset ve rong moi khi doi tu khoa.
  const [extra, setExtra] = useState<AdminVideo[]>([])
  const [loadingMore, setLoadingMore] = useState(false)

  const page1 = useLoad(
    () => adminApi.videos({ status: 'approved', q: search, limit: PAGE }),
    [search],
  )

  useEffect(() => {
    setExtra([])
  }, [search])

  const videos = [...(page1.data?.videos ?? []), ...extra]
  const total = page1.data?.total ?? 0
  const hasMore = videos.length < total

  async function loadMore(): Promise<void> {
    setLoadingMore(true)
    try {
      const r = await adminApi.videos({
        status: 'approved',
        q: search,
        limit: PAGE,
        offset: videos.length,
      })
      setExtra((prev) => [...prev, ...r.videos])
    } catch {
      toast('error', 'Không tải thêm được')
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--bg-elev)' }}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm trong video đã duyệt — gõ không dấu cũng được…"
          aria-label="Tìm video đã duyệt"
          style={{ flex: '1 1 240px' }}
        />
        {q ? (
          <Btn small onClick={() => setQ('')} aria-label="Xoá từ khoá">
            ✕
          </Btn>
        ) : null}
        <Btn
          small
          variant="primary"
          disabled={sel.size === 0}
          onClick={() => {
            void adminApi
              .addToShelf(shelfId, [...sel])
              .then((r) => {
                toast('ok', `Đã thêm ${r.added} video${r.skipped > 0 ? `, bỏ qua ${r.skipped} đã có` : ''}`)
                setSel(new Set())
                onDone()
              })
              .catch(() => toast('error', 'Không thêm được'))
          }}
        >
          Thêm {sel.size > 0 ? `${sel.size} video` : ''}
        </Btn>
      </div>

      {/* Dem ro rang: bo me luon biet con bao nhieu chua hien. */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-dim)' }}>
        <span>
          {search ? `Khớp ${total} video` : `${total} video đã duyệt`}
          {total > 0 ? ` — đang xem ${videos.length}` : ''}
        </span>
        {page1.loading ? <span>đang tìm…</span> : null}
        {sel.size > 0 ? (
          <>
            <Badge color={C.focus}>đã chọn {sel.size}</Badge>
            <Btn small onClick={() => setSel(new Set())}>
              Bỏ chọn hết
            </Btn>
          </>
        ) : null}
      </div>

      {page1.loading && videos.length === 0 ? <Spinner /> : null}

      {!page1.loading && videos.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
          {search ? (
            <>
              Không có video đã duyệt nào khớp "<b>{search}</b>".
            </>
          ) : (
            <>
              Không có video đã duyệt nào. Sang tab <b>Hàng chờ duyệt</b> để duyệt trước.
            </>
          )}
        </p>
      ) : null}

      <div
        className="grid gap-2 overflow-y-auto"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          maxHeight: '26rem',
        }}
      >
        {videos.map((v) => {
          const on = sel.has(v.id)
          return (
            <button
              key={v.id}
              type="button"
              className="cursor-pointer overflow-hidden rounded-lg border-0 p-0 text-left"
              style={{
                background: 'var(--card)',
                outline: on ? '3px solid var(--focus)' : 'none',
                outlineOffset: -1,
              }}
              onClick={() =>
                setSel((prev) => {
                  const n = new Set(prev)
                  if (n.has(v.id)) n.delete(v.id)
                  else n.add(v.id)
                  return n
                })
              }
              aria-pressed={on}
            >
              {v.thumbnail ? (
                <img
                  src={v.thumbnail}
                  alt=""
                  loading="lazy"
                  className="block w-full object-cover"
                  style={{ aspectRatio: '16/9' }}
                />
              ) : null}
              <p className="truncate px-2 py-1.5 text-xs font-bold">{v.title}</p>
              {v.shelf_count > 0 ? (
                <p className="px-2 pb-1.5 text-xs" style={{ color: 'var(--text-dim)' }}>
                  đã ở {v.shelf_count} kệ
                </p>
              ) : null}
            </button>
          )
        })}
      </div>

      {hasMore ? (
        <div className="mt-3 flex justify-center">
          <Btn small onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? 'Đang tải…' : `⬇ Tải thêm ${Math.min(PAGE, total - videos.length)} video`}
          </Btn>
        </div>
      ) : null}
    </div>
  )
}
