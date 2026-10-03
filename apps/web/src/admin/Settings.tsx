import { useCallback, useEffect, useRef, useState } from 'react'
import { adminApi, ApiError, type FilterRule, type UpdateSnapshot } from '@/lib/api'
import { C } from '@/lib/color'
import { filterTypeLabel, formatBytes, formatDate, formatRelative } from '@/lib/format'
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

      <UpdateSection />

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

        <Field
          label="Dung lượng tối đa (GB)"
          hint="Vượt hạn mức thì tự xoá video ít xem nhất trước."
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

// ═══ Cap nhat app ═══════════════════════════════════════════════════

const SETUP_CMD = `cd ~/kidtube                       # thư mục đã git clone
echo "KIDTUBE_REPO_DIR=$PWD" >> .env
echo "COMPOSE_PROFILES=updater" >> .env
docker compose up -d`

/**
 * App chay tren HTTP trong LAN, ma `navigator.clipboard` chi ton tai o
 * secure context -> phai co duong lui bang textarea an.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* roi xuong duong lui */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

function CopyBox({ text }: { text: string }): React.ReactElement {
  return (
    <div>
      <pre
        className="overflow-x-auto rounded-xl p-3 text-xs"
        style={{ background: 'var(--bg)', border: '1px solid var(--card-hi)', lineHeight: 1.7 }}
      >
        {text}
      </pre>
      <div className="mt-2">
        <Btn
          small
          onClick={() => {
            void copyText(text).then((ok) =>
              toast(ok ? 'ok' : 'error', ok ? 'Đã copy lệnh' : 'Không copy được — chép tay vậy'),
            )
          }}
        >
          📋 Copy lệnh
        </Btn>
      </div>
    </div>
  )
}

/**
 * Cap nhat app bang mot cu bam.
 *
 * Diem kho cua man hinh nay: giua chung thi CHINH server dang tra ve trang
 * nay bi dung lai va thay bang ban moi. Nen loi mang o day khong phai loi —
 * do la dau hieu viec cap nhat dang chay dung. Ta cu goi lai den khi no song
 * lai, roi tai lai trang vi ma JavaScript trong trinh duyet da la ban cu.
 */
function UpdateSection(): React.ReactElement {
  const [snap, setSnap] = useState<UpdateSnapshot | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [serverDown, setServerDown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const sawUpdating = useRef(false)

  const load = useCallback(async (): Promise<void> => {
    try {
      const d = await adminApi.update()
      setSnap(d)
      setServerDown(false)
      setLoadError(null)
    } catch (err) {
      if (err instanceof ApiError) setLoadError(err.message)
      else setServerDown(true) // server dang khoi dong lai
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const phase = snap?.updater.phase ?? 'idle'
  const pending = snap?.updater.pendingRequest ?? false
  const working = phase !== 'idle' || pending || serverDown

  // Nho lai rang ta DA thay no chay — de biet khi nao can tai lai trang.
  useEffect(() => {
    if (phase === 'updating') sawUpdating.current = true
  }, [phase])

  useEffect(() => {
    if (!working) return
    const t = window.setInterval(() => void load(), 2000)
    return () => window.clearInterval(t)
  }, [working, load])

  // Chay xong: ma JS trong trinh duyet la ban cu -> phai tai lai trang.
  useEffect(() => {
    if (done || !sawUpdating.current || working) return
    if (!snap?.lastRun?.ok) return
    setDone(true)
    const t = window.setTimeout(() => window.location.reload(), 5000)
    return () => window.clearTimeout(t)
  }, [working, snap, done])

  async function fire(kind: 'check' | 'run'): Promise<void> {
    setBusy(true)
    try {
      if (kind === 'check') {
        await adminApi.checkUpdate()
        toast('ok', 'Đang kiểm tra…')
      } else {
        await adminApi.runUpdate()
        toast('ok', 'Đã bắt đầu cập nhật. Đừng tắt nguồn Pi.')
      }
      await load()
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Không gửi được yêu cầu')
    } finally {
      setBusy(false)
    }
  }

  const u = snap?.updater
  const repo = snap?.repo
  const behind = repo?.behind ?? 0
  const w = snap?.warnings

  function confirmAndRun(): void {
    const lines = ['Cập nhật KidTube lên bản mới?', '']
    if (w?.activeKidSessions) {
      lines.push(`⚠ Có ${w.activeKidSessions} bé đang xem — video sẽ bị ngắt giữa chừng.`)
    }
    if (w?.downloadRunning) {
      lines.push('⚠ Đang tải một video — job sẽ chạy lại từ đầu sau khi cập nhật.')
    }
    lines.push(
      '',
      'Quá trình mất khoảng 2–5 phút trên Pi 5. App sẽ tạm ngưng khi khởi động lại.',
      'ĐỪNG tắt nguồn Pi trong lúc này.',
    )
    if (!window.confirm(lines.join('\n'))) return
    void fire('run')
  }

  return (
    <Panel
      title="Phiên bản & cập nhật"
      subtitle="Cập nhật app mà không cần mở terminal"
      actions={
        u?.online ? (
          <>
            <Btn small disabled={busy || working} onClick={() => void fire('check')}>
              🔄 Kiểm tra
            </Btn>
            <Btn
              small
              variant={behind > 0 ? 'primary' : 'ghost'}
              disabled={busy || working || !u.repoOk}
              onClick={confirmAndRun}
            >
              ⬆ Cập nhật ngay
            </Btn>
          </>
        ) : null
      }
    >
      {/* ── Dang chay ban nao ─────────────────────────────────── */}
      <div
        className="mb-4 grid gap-3 text-sm"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}
      >
        <Info label="Phiên bản">{snap?.running.version ?? '—'}</Info>
        <Info label="Bản dựng đang chạy">
          <code className="text-xs">
            {snap?.running.commitShort ?? snap?.deployedCommit?.slice(0, 7) ?? 'không rõ'}
          </code>
        </Info>
        <Info label="Build lúc">{formatDate(snap?.running.builtAt) || '—'}</Info>
        {repo ? <Info label="Nhánh">{repo.branch}</Info> : null}
      </div>

      {/* ── Dang chay ─────────────────────────────────────────── */}
      {done ? (
        <Alert kind="ok">
          <b>Cập nhật xong.</b> Đang tải lại trang…{' '}
          <Btn small onClick={() => window.location.reload()}>
            Tải lại ngay
          </Btn>
        </Alert>
      ) : working ? (
        <Alert kind="info">
          <b>
            {serverDown
              ? 'App đang khởi động lại…'
              : phase === 'updating'
                ? 'Đang cập nhật…'
                : 'Đang kiểm tra…'}
          </b>{' '}
          {phase === 'updating' || serverDown
            ? 'Mất khoảng 2–5 phút trên Pi 5. Đừng tắt nguồn Pi, và cứ để trang này mở — nó tự theo dõi tiến trình.'
            : null}
        </Alert>
      ) : null}

      {/* ── Mat lien lac nhung van dang chay ──────────────────── */}
      {u?.installed && !u.online && phase === 'updating' ? (
        <Alert kind="warn">
          Mất liên lạc với dịch vụ cập nhật trong lúc nó đang chạy. Thường là do bước dựng lại
          chiếm hết CPU của Pi — cứ đợi thêm vài phút.
        </Alert>
      ) : null}

      {/* ── Chua bat updater ──────────────────────────────────── */}
      {!u?.installed ? (
        <>
          <Alert kind="warn">
            <b>Chưa bật dịch vụ cập nhật.</b> Nút bấm cần một container phụ (
            <code>kidtube-updater</code>) vì container chính không thể tự dựng lại chính nó. Chạy
            mấy lệnh dưới đây trên Pi <b>một lần duy nhất</b>, sau đó cập nhật được bằng một cú bấm
            mãi mãi.
            <br />
            <br />
            Container phụ này mount docker socket, tức là nó có quyền ngang root trên Pi. Không
            muốn vậy thì đừng bật — cập nhật bằng tay như cũ vẫn chạy tốt.
          </Alert>
          <CopyBox text={SETUP_CMD} />
        </>
      ) : !u.repoOk ? (
        <Alert kind="error">
          <b>Dịch vụ cập nhật không tìm thấy thư mục cài đặt.</b>
          <br />
          {u.repoError}
        </Alert>
      ) : !u.online && phase !== 'updating' ? (
        <Alert kind="warn">
          <b>Dịch vụ cập nhật đã cài nhưng không phản hồi.</b> Kiểm tra trên Pi:{' '}
          <code>docker compose logs kidtube-updater</code>
        </Alert>
      ) : null}

      {/* ── Co ban moi khong ──────────────────────────────────── */}
      {u?.online && u.repoOk && repo && !working && !done ? (
        behind > 0 ? (
          <Alert kind="warn">
            <b>Có {behind} bản cập nhật mới.</b> Bấm <b>⬆ Cập nhật ngay</b> ở trên.
          </Alert>
        ) : (
          <Alert kind="ok">
            Đang chạy bản mới nhất. Kiểm tra lần cuối {formatRelative(repo.checkedAt)}.
          </Alert>
        )
      ) : null}

      {repo?.dirty ? (
        <Alert kind="warn">
          Thư mục cài đặt trên Pi có thay đổi chưa commit, nên cập nhật tự động bị chặn (để không
          xoá mất chúng). Xử lý trên Pi: <code>cd {u?.repoDir} && git status</code>
        </Alert>
      ) : null}

      {repo?.fetchError ? (
        <Alert kind="warn">
          Không hỏi được máy chủ GitHub — số liệu bên dưới có thể cũ.
          <br />
          <code className="text-xs">{repo.fetchError}</code>
        </Alert>
      ) : null}

      {/* ── Danh sach thay doi ────────────────────────────────── */}
      {repo?.pending.length ? (
        <div className="mb-4">
          <p className="mb-2 text-xs" style={{ color: 'var(--text-dim)' }}>
            Những thay đổi sẽ được cài
          </p>
          <div className="flex flex-col gap-1">
            {repo.pending.map((c) => (
              <div
                key={c.short}
                className="flex items-start gap-2.5 rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--card)' }}
              >
                <code className="shrink-0 text-xs" style={{ color: 'var(--text-dim)' }}>
                  {c.short}
                </code>
                <span className="min-w-0 flex-1">{c.subject}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Ket qua lan chay truoc ────────────────────────────── */}
      {snap?.lastRun ? (
        <Alert kind={snap.lastRun.ok ? 'ok' : 'error'}>
          Lần chạy gần nhất ({formatDate(snap.lastRun.finishedAt)}):{' '}
          <b>{snap.lastRun.ok ? 'thành công' : `thất bại ở bước "${snap.lastRun.step}"`}</b>
          {snap.lastRun.error ? (
            <>
              <br />
              <span className="text-xs" style={{ wordBreak: 'break-word' }}>
                {snap.lastRun.error}
              </span>
            </>
          ) : null}
        </Alert>
      ) : null}

      {snap?.log ? (
        <details>
          <summary className="cursor-pointer text-sm" style={{ color: 'var(--text-dim)' }}>
            Nhật ký chi tiết
          </summary>
          <pre
            className="mt-2 overflow-auto rounded-xl p-3 text-xs"
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--card-hi)',
              maxHeight: 280,
              lineHeight: 1.6,
            }}
          >
            {snap.log}
          </pre>
        </details>
      ) : null}

      {loadError ? <Alert kind="error">{loadError}</Alert> : null}
    </Panel>
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
