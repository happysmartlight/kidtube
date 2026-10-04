import { useState } from 'react'
import { adminApi, type AdminProfile, ApiError } from '@/lib/api'
import { C } from '@/lib/color'
import { formatMinutes } from '@/lib/format'
import { Spinner } from '@/ui/Spinner'
import { Alert, Badge, Btn, Field, Input, Panel, Select, toast, Toggle, useLoad } from './ui'

const AVATARS = ['🐻', '🐰', '🐯', '🦊', '🐼', '🐸', '🐧', '🦉', '🐙', '🦄', '🐝', '🐢']
const COLORS = ['#ffd23f', '#ff6b8a', '#4ecdc4', '#a78bfa', '#ff9f43', '#4ecb71', '#5b9cff', '#f472b6']

export function Profiles(): React.ReactElement {
  const { data, loading, error, reload } = useLoad(() => adminApi.profiles())
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState(AVATARS[0]!)
  const [color, setColor] = useState(COLORS[0]!)

  async function create(): Promise<void> {
    if (!name.trim()) return
    try {
      await adminApi.createProfile({ name: name.trim(), avatar, color })
      toast('ok', `Đã thêm bé ${name.trim()}`)
      setName('')
      setCreating(false)
      reload()
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Không thêm được')
    }
  }

  return (
    <>
      <Panel
        icon="🧒"
        title="Các bé"
        subtitle="Mỗi bé có giới hạn thời gian và kệ riêng"
        actions={
          <>
            <Btn small onClick={() => setCreating(!creating)}>
              {creating ? '✕ Huỷ' : '➕ Thêm bé'}
            </Btn>
            <Btn small onClick={reload}>
              🔄
            </Btn>
          </>
        }
      >
        {creating ? (
          <div className="mb-4 rounded-xl p-4" style={{ background: 'var(--card)' }}>
            <Field label="Tên bé">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void create()
                }}
                placeholder="Bảo"
                autoFocus
              />
            </Field>

            <Field label="Con vật">
              <div className="flex flex-wrap gap-1.5">
                {AVATARS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAvatar(a)}
                    aria-pressed={avatar === a}
                    aria-label={`Chọn ${a}`}
                    className="grid place-items-center rounded-xl"
                    style={{
                      width: 46,
                      height: 46,
                      fontSize: 26,
                      background: 'var(--card-hi)',
                      border: avatar === a ? '3px solid var(--focus)' : '3px solid transparent',
                      cursor: 'pointer',
                    }}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Màu">
              <div className="flex flex-wrap gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-pressed={color === c}
                    aria-label={`Chọn màu ${c}`}
                    className="rounded-lg"
                    style={{
                      width: 34,
                      height: 34,
                      background: c,
                      border: color === c ? '3px solid var(--text)' : '3px solid transparent',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            </Field>

            <Btn variant="primary" onClick={() => void create()} disabled={!name.trim()}>
              ➕ Thêm bé
            </Btn>
          </div>
        ) : null}

        {loading ? <Spinner /> : null}
        {error ? <Alert kind="error">{error}</Alert> : null}

        <div className="flex flex-col gap-3">
          {data?.profiles.map((p) => (
            <ProfileCard
              key={p.id}
              profile={p}
              canDelete={(data?.profiles.length ?? 0) > 1}
              onChanged={reload}
            />
          ))}
        </div>
      </Panel>
    </>
  )
}

function ProfileCard({
  profile: p,
  canDelete,
  onChanged,
}: {
  profile: AdminProfile
  canDelete: boolean
  onChanged: () => void
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({
    daily: p.daily_limit_min,
    session: p.session_limit_min,
    videos: p.video_limit_session,
    from: p.allowed_from,
    to: p.allowed_to,
    autoplay: p.autoplay === 1,
    autoplayMax: p.autoplay_max,
  })

  async function save(): Promise<void> {
    try {
      await adminApi.updateProfile(p.id, {
        dailyLimitMin: draft.daily,
        sessionLimitMin: draft.session,
        videoLimitSession: draft.videos,
        allowedFrom: draft.from,
        allowedTo: draft.to,
        autoplay: draft.autoplay,
        autoplayMax: draft.autoplayMax,
      })
      toast('ok', `Đã lưu cài đặt cho ${p.name}`)
      onChanged()
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Không lưu được')
    }
  }

  const q = p.quota

  return (
    <div className="rounded-xl" style={{ background: 'var(--card)' }}>
      <div className="flex flex-wrap items-center gap-3 p-3">
        <span
          className="grid shrink-0 place-items-center rounded-full"
          style={{ width: 52, height: 52, fontSize: 30, background: p.color }}
          aria-hidden="true"
        >
          {p.avatar}
        </span>

        <div className="min-w-0 flex-1" style={{ flexBasis: 190 }}>
          <p className="font-bold">{p.name}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-dim)' }}>
            <span>
              {p.daily_limit_min > 0 ? `${p.daily_limit_min} phút/ngày` : 'không giới hạn ngày'}
            </span>
            <span>·</span>
            <span>
              {p.session_limit_min > 0 ? `${p.session_limit_min} phút/lượt` : 'không giới hạn lượt'}
            </span>
            <span>·</span>
            <span>
              {p.allowed_from}–{p.allowed_to}
            </span>
            {p.is_active !== 1 ? <Badge color={C.warn}>đang tắt</Badge> : null}
          </div>
        </div>

        {/* Trang thai HOM NAY — bo me hay muon biet ngay */}
        <div className="shrink-0 text-right text-xs" style={{ color: 'var(--text-dim)' }}>
          <p className="font-bold" style={{ color: q.allowed ? C.ok : C.danger }}>
            {q.allowed ? '● đang được xem' : '● đang bị chặn'}
          </p>
          <p>hôm nay: {formatMinutes(q.dailyUsedSec)}</p>
          {!q.allowed && q.reason ? <p>{REASON[q.reason] ?? q.reason}</p> : null}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Btn
            small
            onClick={() => {
              void adminApi
                .grantMinutes(p.id, 10)
                .then(() => {
                  toast('ok', `Đã cho ${p.name} thêm 10 phút`)
                  onChanged()
                })
                .catch(() => toast('error', 'Không cấp được'))
            }}
            title="Trừ 10 phút khỏi thời gian đã dùng và reset số video của lượt hiện tại"
          >
            ⏱ +10 phút
          </Btn>
          <Btn
            small
            onClick={() => {
              void adminApi
                .endSession(p.id)
                .then(() => {
                  toast('ok', 'Đã kết thúc lượt xem')
                  onChanged()
                })
                .catch(() => toast('error', 'Không dừng được'))
            }}
            title="Kết thúc lượt xem hiện tại ngay lập tức"
          >
            ⏹ Dừng lượt
          </Btn>
          <Btn small onClick={() => setOpen(!open)}>
            {open ? '▲' : '⚙ Cài đặt'}
          </Btn>
          {canDelete ? (
            <Btn
              small
              variant="danger"
              onClick={() => {
                if (!window.confirm(`Xoá bé "${p.name}"? Nhật ký xem sẽ mất.`)) {
                  return
                }
                void adminApi
                  .deleteProfile(p.id)
                  .then(() => {
                    toast('ok', 'Đã xoá')
                    onChanged()
                  })
                  .catch((err: unknown) =>
                    toast('error', err instanceof ApiError ? err.message : 'Không xoá được'),
                  )
              }}
            >
              🗑
            </Btn>
          ) : null}
        </div>
      </div>

      {open ? (
        <div className="p-4" style={{ borderTop: '1px solid var(--card-hi)' }}>
          <div className="grid gap-x-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
            <Field label="Giới hạn mỗi ngày (phút)" hint="0 = không giới hạn">
              <Input
                type="number"
                min={0}
                max={1440}
                value={draft.daily}
                onChange={(e) => setDraft({ ...draft, daily: Number(e.target.value) })}
              />
            </Field>

            <Field
              label="Giới hạn mỗi lượt (phút)"
              hint="0 = không giới hạn. Nghỉ 10 phút thì được một lượt mới."
            >
              <Input
                type="number"
                min={0}
                max={480}
                value={draft.session}
                onChange={(e) => setDraft({ ...draft, session: Number(e.target.value) })}
              />
            </Field>

            <Field
              label="Số video mỗi lượt"
              hint="0 = không giới hạn. Hữu ích cho bé chưa hiểu khái niệm thời gian."
            >
              <Input
                type="number"
                min={0}
                max={50}
                value={draft.videos}
                onChange={(e) => setDraft({ ...draft, videos: Number(e.target.value) })}
              />
            </Field>

            <Field label="Được xem từ" hint="Dạng HH:MM">
              <Input
                type="time"
                value={draft.from}
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
              />
            </Field>

            <Field label="Đến" hint="Đặt hai giờ giống nhau = không giới hạn khung giờ">
              <Input
                type="time"
                value={draft.to}
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
              />
            </Field>

            <Field label="Số video tự phát liên tiếp" hint="Chỉ có tác dụng khi bật tự phát">
              <Select
                value={draft.autoplayMax}
                onChange={(e) => setDraft({ ...draft, autoplayMax: Number(e.target.value) })}
                disabled={!draft.autoplay}
              >
                {[1, 2, 3, 5, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} video
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Toggle
            checked={draft.autoplay}
            onChange={(v) => setDraft({ ...draft, autoplay: v })}
            label="Tự phát video tiếp theo"
            hint="Mặc định TẮT. Bật thì hết video này sẽ tự sang video sau trong cùng kệ — dễ làm bé xem lâu hơn dự định."
          />

          <Toggle
            checked={p.is_active === 1}
            onChange={(v) => {
              void adminApi
                .updateProfile(p.id, { isActive: v })
                .then(onChanged)
                .catch(() => toast('error', 'Không lưu được'))
            }}
            label="Bật hồ sơ này"
            hint="Tắt thì bé không hiện ở màn hình chọn."
          />

          <Btn variant="primary" onClick={() => void save()}>
            💾 Lưu
          </Btn>
        </div>
      ) : null}
    </div>
  )
}

const REASON: Record<string, string> = {
  outside_window: 'ngoài giờ cho phép',
  daily_limit: 'hết giờ trong ngày',
  session_limit: 'hết giờ của lượt',
  video_limit: 'hết số video',
  profile_inactive: 'hồ sơ đang tắt',
}
