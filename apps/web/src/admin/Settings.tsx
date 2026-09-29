import { useEffect, useState } from 'react'
import { adminApi, ApiError, type FilterRule } from '@/lib/api'
import { C } from '@/lib/color'
import { filterTypeLabel, formatBytes } from '@/lib/format'
import { getLocalOverride, setLocalOverride, type ModeSetting } from '@/lib/mode'
import { Spinner } from '@/ui/Spinner'
import { Alert, Badge, Btn, Field, Input, Panel, Select, toast, Toggle, useLoad } from './ui'

export function Settings(): React.ReactElement {
  const { data, loading, error, reload } = useLoad(() => adminApi.settings())
  const [local, setLocal] = useState<ModeSetting>(() => getLocalOverride() ?? 'auto')

  const s = data?.settings ?? {}
  const sys = data?.system

  function put(key: string, value: string | boolean): void {
    void adminApi
      .updateSettings({ [key]: value })
      .then(reload)
      .catch((err: unknown) =>
        toast('error', err instanceof ApiError ? err.message : 'Không lưu được'),
      )
  }

  const bool = (key: string, fallback = false): boolean => {
    const v = s[key]
    return v === undefined ? fallback : v === '1'
  }

  if (loading) return <Spinner />
  if (error) return <Alert kind="error">{error}</Alert>

  return (
    <>
      {/* ── Tinh trang he thong ─────────────────────────────────── */}
      <Panel title="Tình trạng hệ thống">
        <div
          className="grid gap-3 text-sm"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}
        >
          <Info label="yt-dlp">
            {sys?.ytdlpAvailable ? (
              <Badge color={C.ok}>có — {sys.ytdlpVersion ?? 'không rõ bản'}</Badge>
            ) : (
              <Badge color={C.warn}>không có</Badge>
            )}
          </Info>
          <Info label="YouTube Data API key">
            {sys?.hasApiKey ? <Badge color={C.ok}>đã cấu hình</Badge> : <Badge color={C.dim}>không có</Badge>}
          </Info>
          <Info label="Node.js">{sys?.nodeVersion}</Info>
          <Info label="Chất lượng tải tối đa">{sys?.downloadMaxHeight}p</Info>
          <Info label="Dung lượng đã dùng">
            {formatBytes(sys?.storage.usedBytes)} / {formatBytes(sys?.storage.limitBytes)} (
            {sys?.storage.fileCount} file)
          </Info>
          <Info label="Thư mục dữ liệu">
            <code className="text-xs">{sys?.dataDir}</code>
          </Info>
        </div>

        {!sys?.ytdlpAvailable ? (
          <Alert kind="warn">
            <b>Không tìm thấy yt-dlp.</b> Vẫn dùng được (RSS lấy được 15 video mới nhất của mỗi
            kênh), nhưng sẽ thiếu: thời lượng video, toàn bộ lịch sử kênh, và <b>chế độ tải
            offline</b>. Nếu chạy bằng Docker thì image đã có sẵn yt-dlp.
          </Alert>
        ) : null}
      </Panel>

      {/* ── Phat video ──────────────────────────────────────────── */}
      <Panel title="Phát video">
        <Toggle
          checked={bool('autoplay_default')}
          onChange={(v) => put('autoplay_default', v)}
          label="Mặc định tự phát video tiếp theo (cho bé mới tạo)"
          hint="Từng bé có thể đặt riêng ở tab Bé. Khuyến nghị TẮT."
        />
        <Toggle
          checked={bool('show_duration', true)}
          onChange={(v) => put('show_duration', v)}
          label="Hiện thời lượng trên thumbnail"
        />
        <Toggle
          checked={bool('show_download_badge', true)}
          onChange={(v) => put('show_download_badge', v)}
          label="Hiện dấu ⬇ cho video đã tải về máy"
        />

        <Field
          label="Cảnh báo trước khi hết giờ (phút)"
          hint="Còn bao nhiêu phút thì hiện nhân vật vẫy tay và đổ 3 nốt chuông — để bé chuẩn bị tâm lý, đỡ khóc khi bị cắt ngang."
        >
          <Input
            type="number"
            min={0}
            max={30}
            defaultValue={s.warn_before_min ?? '5'}
            onBlur={(e) => put('warn_before_min', e.target.value)}
          />
        </Field>

        <Toggle
          checked={bool('sfx_enabled', true)}
          onChange={(v) => put('sfx_enabled', v)}
          label="Bật âm thanh phản hồi khi bấm"
        />
      </Panel>

      {/* ── Giao dien ───────────────────────────────────────────── */}
      <Panel title="Giao diện">
        <Field
          label="Chế độ hiển thị (áp dụng cho mọi thiết bị)"
          hint="tv = chữ và card to hơn 1.4×, viền an toàn 5% chống overscan của TV. auto = tự nhận diện."
        >
          <Select
            value={s.ui_mode_override ?? 'auto'}
            onChange={(e) => put('ui_mode_override', e.target.value)}
          >
            <option value="auto">Tự nhận diện</option>
            <option value="touch">Cảm ứng (tablet)</option>
            <option value="tv">TV (xem xa, dùng remote)</option>
          </Select>
        </Field>

        <Field
          label="Ghi đè chỉ trên THIẾT BỊ NÀY"
          hint="Lưu trong trình duyệt này, ưu tiên hơn cài đặt trên. Dùng khi TV nhận diện sai — mở trang này trên chính TV rồi chọn 'TV'."
        >
          <div className="flex flex-wrap gap-2">
            {(['auto', 'touch', 'tv'] as ModeSetting[]).map((m) => (
              <Btn
                key={m}
                small
                variant={local === m ? 'primary' : 'ghost'}
                onClick={() => {
                  setLocal(m)
                  setLocalOverride(m === 'auto' ? null : m)
                  toast('ok', 'Đã lưu. Tải lại trang để thấy thay đổi.')
                }}
              >
                {m === 'auto' ? 'Tự nhận diện' : m === 'touch' ? 'Cảm ứng' : 'TV'}
              </Btn>
            ))}
          </div>
        </Field>
      </Panel>

      {/* ── Tai offline ─────────────────────────────────────────── */}
      <Panel
        title="Tải video về máy (offline)"
        subtitle="Xem được khi mất mạng, không có quảng cáo, load tức thì"
      >
        <Alert kind="info">
          Với <b>TV LG</b> nên bật cái này: file mp4 phát bằng trình phát sẵn của TV ổn định hơn
          nhúng iframe YouTube, và không có quảng cáo. Lưu ý việc tải xuống là vùng xám theo điều
          khoản YouTube — chấp nhận ở phạm vi dùng riêng trong nhà.
        </Alert>

        <Toggle
          checked={bool('offline_enabled')}
          onChange={(v) => put('offline_enabled', v)}
          label="Bật chế độ tải offline"
          hint={sys?.ytdlpAvailable ? undefined : 'Cần yt-dlp — hiện chưa có trên hệ thống.'}
          disabled={!sys?.ytdlpAvailable}
        />

        <Toggle
          checked={bool('offline_auto_favorites')}
          onChange={(v) => put('offline_auto_favorites', v)}
          label="Tự tải video con đánh dấu yêu thích"
          hint="Video hay xem lại thì nên có bản local."
          disabled={!bool('offline_enabled')}
        />

        <Field
          label="Dung lượng tối đa (GB)"
          hint="Vượt hạn mức thì tự xoá video ít xem nhất trước. Video trong danh sách yêu thích không bao giờ bị xoá."
        >
          <Input
            type="number"
            min={1}
            max={2000}
            defaultValue={s.offline_max_gb ?? '20'}
            onBlur={(e) => put('offline_max_gb', e.target.value)}
          />
        </Field>
      </Panel>

      {/* ── Nhap nguon ──────────────────────────────────────────── */}
      <Panel title="Kéo video mới">
        <Field
          label="Chu kỳ kiểm tra nguồn (giờ)"
          hint="Hệ thống tự kiểm tra các nguồn có bật 'tự kéo'. Video mới vào hàng chờ duyệt, KHÔNG tự hiện cho con."
        >
          <Input
            type="number"
            min={1}
            max={168}
            defaultValue={s.pull_interval_hours ?? '6'}
            onBlur={(e) => put('pull_interval_hours', e.target.value)}
          />
        </Field>
      </Panel>

      <Filters />
      <PinSection />
    </>
  )
}

function Info({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div>
      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
        {label}
      </p>
      <p className="font-bold">{children}</p>
    </div>
  )
}

// ═══ Bo loc tu dong ═════════════════════════════════════════════════

const FILTER_HELP: Record<string, string> = {
  keyword_block: 'Nhiều từ khoá cách nhau bằng dấu phẩy. Không phân biệt hoa/thường và dấu tiếng Việt.',
  max_duration: 'Số GIÂY. Video dài hơn mức này bị loại. Ví dụ 2400 = 40 phút.',
  min_duration: 'Số GIÂY. Video ngắn hơn mức này bị loại (thường là Shorts). Ví dụ 45.',
  block_live: 'Đặt giá trị là 1 để chặn video đang phát trực tiếp.',
  title_regex: 'Biểu thức chính quy JavaScript, không phân biệt hoa/thường.',
}

function Filters(): React.ReactElement {
  const { data, loading, reload } = useLoad(() => adminApi.filters())
  const [type, setType] = useState('keyword_block')
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')

  async function add(): Promise<void> {
    if (!value.trim()) return
    try {
      await adminApi.createFilter({ type, value: value.trim(), note: note.trim() })
      toast('ok', 'Đã thêm bộ lọc')
      setValue('')
      setNote('')
      reload()
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Không thêm được')
    }
  }

  return (
    <Panel
      title="Bộ lọc tự động"
      subtitle="Hỗ trợ việc duyệt, KHÔNG thay thế nó — video bị lọc vào tab 'Đã loại', bố mẹ vẫn xem lại được"
      actions={
        <Btn
          small
          onClick={() => {
            void adminApi
              .refilter(true)
              .then((r) => {
                toast('ok', `Quét ${r.scanned} video đang chờ, loại ${r.blocked}`)
              })
              .catch(() => toast('error', 'Không chạy lại được'))
          }}
          title="Áp dụng các bộ lọc hiện tại lên video đang chờ duyệt"
        >
          🔁 Chạy lại trên hàng chờ
        </Btn>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div style={{ flex: '0 0 190px' }}>
          <Field label="Loại">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {Object.keys(FILTER_HELP).map((t) => (
                <option key={t} value={t}>
                  {filterTypeLabel(t)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div style={{ flex: '1 1 200px' }}>
          <Field label="Giá trị" hint={FILTER_HELP[type]}>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void add()
              }}
              placeholder={
                type === 'keyword_block'
                  ? 'bạo lực, kinh dị, prank'
                  : type === 'block_live'
                    ? '1'
                    : type === 'title_regex'
                      ? '\\b(challenge|24h)\\b'
                      : '2400'
              }
            />
          </Field>
        </div>

        <div style={{ flex: '1 1 150px' }}>
          <Field label="Ghi chú (tuỳ chọn)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="lý do" />
          </Field>
        </div>

        <Btn variant="primary" onClick={() => void add()} disabled={!value.trim()}>
          ➕ Thêm
        </Btn>
      </div>

      {loading ? <Spinner /> : null}

      <div className="flex flex-col gap-1.5">
        {data?.filters.map((f: FilterRule) => (
          <div
            key={f.id}
            className="flex flex-wrap items-center gap-2.5 rounded-lg p-2.5"
            style={{ background: 'var(--card)', opacity: f.is_active ? 1 : 0.5 }}
          >
            <Badge color={C.focus}>{filterTypeLabel(f.type)}</Badge>
            <code className="min-w-0 flex-1 truncate text-sm">{f.value}</code>
            {f.note ? (
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                {f.note}
              </span>
            ) : null}
            <Btn
              small
              onClick={() => {
                void adminApi
                  .updateFilter(f.id, { isActive: f.is_active !== 1 })
                  .then(reload)
                  .catch(() => toast('error', 'Không đổi được'))
              }}
            >
              {f.is_active === 1 ? '⏸ Tắt' : '▶️ Bật'}
            </Btn>
            <Btn
              small
              variant="danger"
              onClick={() => {
                void adminApi
                  .deleteFilter(f.id)
                  .then(reload)
                  .catch(() => toast('error', 'Không xoá được'))
              }}
            >
              🗑
            </Btn>
          </div>
        ))}
      </div>

      <Alert kind="info">
        Bộ lọc theo <b>độ dài</b> chỉ áp dụng cho video đã biết thời lượng. RSS không trả thời
        lượng, nên nếu không có yt-dlp hoặc API key thì các video đó sẽ bỏ qua bộ lọc độ dài (hiện
        dấu <b>?</b> ở hàng chờ duyệt).
      </Alert>
    </Panel>
  )
}

// ═══ Doi PIN ════════════════════════════════════════════════════════

function PinSection(): React.ReactElement {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [isDefault, setIsDefault] = useState(false)

  useEffect(() => {
    void adminApi
      .me()
      .then((r) => setIsDefault(r.pinIsDefault))
      .catch(() => {})
  }, [])

  async function change(): Promise<void> {
    if (next !== confirm) {
      toast('error', 'Hai lần nhập PIN mới không giống nhau')
      return
    }
    try {
      await adminApi.changePin(current, next)
      toast('ok', 'Đã đổi PIN. Các thiết bị khác đã bị đăng xuất.')
      setCurrent('')
      setNext('')
      setConfirm('')
      setIsDefault(false)
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Không đổi được PIN')
    }
  }

  return (
    <Panel title="PIN của bố mẹ">
      {isDefault ? (
        <Alert kind="warn">
          Bạn đang dùng <b>PIN mặc định</b>. Đổi ngay — ai biết PIN mặc định là vào được trang quản
          trị.
        </Alert>
      ) : null}

      <div className="grid gap-x-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <Field label="PIN hiện tại">
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label="PIN mới" hint="4–12 chữ số">
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        <Field label="Nhập lại PIN mới">
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
      </div>

      <Btn
        variant="primary"
        onClick={() => void change()}
        disabled={!current || next.length < 4 || !confirm}
      >
        🔑 Đổi PIN
      </Btn>
    </Panel>
  )
}
