import { useCallback, useEffect, useRef, useState } from 'react'
import { adminApi, ApiError, type FilterRule, type UpdateSnapshot } from '@/lib/api'
import { C, withAlpha } from '@/lib/color'
import { filterTypeLabel, formatBytes, formatDate, formatMinutes, formatRelative } from '@/lib/format'
import { getLocalOverride, setLocalOverride, type ModeSetting } from '@/lib/mode'
import { Spinner } from '@/ui/Spinner'
import { Alert, Badge, Btn, Dialog, Field, Input, Panel, Select, toast, Toggle, useLoad } from './ui'

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
      <Panel icon="🩺" title="Tình trạng hệ thống">
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
      <Panel icon="▶️" title="Phát video">
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
      <Panel icon="🖥️" title="Giao diện">
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
        icon="💾"
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
      <Panel icon="🔄" title="Kéo video mới">
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

  /** Tra ve `true` neu server nhan yeu cau — de hop xac nhan biet ma dong. */
  async function fire(kind: 'check' | 'run'): Promise<boolean> {
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
      return true
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Không gửi được yêu cầu')
      return false
    } finally {
      setBusy(false)
    }
  }

  const [confirming, setConfirming] = useState(false)
  const closeConfirm = useCallback(() => setConfirming(false), [])

  const u = snap?.updater
  const repo = snap?.repo
  const behind = repo?.behind ?? 0

  return (
    <Panel
      icon="🚀"
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
              onClick={() => {
                setConfirming(true)
                // Lay lai so lieu: "bé đang xem" / "đang tải" trong hop phai
                // la cua LUC NAY, khong phai luc mo trang.
                void load()
              }}
            >
              ⬆ Cập nhật ngay
            </Btn>
          </>
        ) : null
      }
    >
      {confirming ? (
        <UpdateConfirm
          snap={snap}
          busy={busy}
          working={working}
          onClose={closeConfirm}
          onConfirm={async () => {
            if (await fire('run')) setConfirming(false)
          }}
        />
      ) : null}

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

/**
 * Hop xac nhan truoc khi cap nhat. Noi ro ba dieu bo me can biet TRUOC khi
 * bam: se cai nhung gi, ai bi anh huong (be dang xem, video dang tai), va
 * mat bao lau / khong duoc tat nguon.
 */
function UpdateConfirm({
  snap,
  busy,
  working,
  onConfirm,
  onClose,
}: {
  snap: UpdateSnapshot | null
  busy: boolean
  working: boolean
  onConfirm: () => Promise<void>
  onClose: () => void
}): React.ReactElement {
  const repo = snap?.repo
  const w = snap?.warnings
  const behind = repo?.behind ?? 0
  const pending = repo?.pending ?? []
  // Updater chi gui toi da 25 thay doi gan nhat.
  const older = behind - pending.length
  const running =
    snap?.running.commitShort ?? snap?.deployedCommit?.slice(0, 7) ?? repo?.headShort ?? null
  const target = pending[0]?.short ?? null

  return (
    <Dialog
      title="Cập nhật KidTube?"
      subtitle={
        behind > 0
          ? `Có ${behind} thay đổi mới sẵn sàng để cài`
          : 'Lần kiểm tra gần nhất chưa thấy bản mới'
      }
      icon="⬆️"
      locked={busy}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose} disabled={busy}>
            Để sau
          </Btn>
          <Btn
            variant="primary"
            autoFocus
            disabled={busy || working}
            onClick={() => void onConfirm()}
          >
            {busy ? 'Đang gửi…' : '⬆ Cập nhật ngay'}
          </Btn>
        </>
      }
    >
      {behind > 0 && running && target ? (
        <div className="mb-3 flex items-center justify-center gap-3">
          <VersionChip label="đang chạy" value={running} />
          <span aria-hidden="true" style={{ color: 'var(--text-dim)', fontSize: 18 }}>
            →
          </span>
          <VersionChip label="bản mới" value={target} highlight />
        </div>
      ) : null}

      {pending.length > 0 ? (
        <div
          className="mb-4 overflow-y-auto rounded-xl"
          style={{ maxHeight: 188, background: 'var(--card)' }}
        >
          {pending.map((c, i) => (
            <div
              key={c.short}
              className="flex items-start gap-2.5 px-3 py-2 text-sm"
              style={{ borderTop: i > 0 ? '1px solid var(--bg-elev)' : undefined }}
            >
              <code className="shrink-0 pt-px text-xs" style={{ color: 'var(--text-dim)' }}>
                {c.short}
              </code>
              <span className="min-w-0 flex-1" style={{ lineHeight: 1.45 }}>
                {c.subject}
              </span>
            </div>
          ))}
          {older > 0 ? (
            <p
              className="px-3 py-2 text-xs"
              style={{ color: 'var(--text-dim)', borderTop: '1px solid var(--bg-elev)' }}
            >
              …và {older} thay đổi cũ hơn
            </p>
          ) : null}
        </div>
      ) : behind === 0 ? (
        <Alert kind="info">
          Bấm vẫn hỏi lại GitHub một lần nữa. Không có gì mới thì app không bị dựng lại, các bé xem
          tiếp bình thường.
        </Alert>
      ) : null}

      {w?.activeKidSessions ? (
        <Alert kind="warn">
          <b>Có {w.activeKidSessions} bé đang xem</b> — video sẽ bị ngắt giữa chừng.
        </Alert>
      ) : null}
      {w?.downloadRunning ? (
        <Alert kind="warn">
          <b>Đang tải một video</b> — sẽ tải lại từ đầu sau khi cập nhật.
        </Alert>
      ) : null}
      {working && !busy ? (
        <Alert kind="info">Đang có một lượt kiểm tra / cập nhật chạy — đợi nó xong đã.</Alert>
      ) : null}

      <ul
        className="mb-4 flex flex-col gap-2 rounded-xl px-4 py-3 text-sm"
        style={{ background: 'var(--card)', lineHeight: 1.45 }}
      >
        <UpdateNote icon="⏱">
          Mất khoảng <b>2–5 phút</b> trên Pi 5.
        </UpdateNote>
        <UpdateNote icon="🔄">
          App tạm ngưng rồi tự khởi động lại — trang này tự tải lại khi xong.
        </UpdateNote>
        <UpdateNote icon="🔌">
          <b style={{ color: C.warn }}>Đừng tắt nguồn Pi</b> trong lúc này.
        </UpdateNote>
      </ul>
    </Dialog>
  )
}

function VersionChip({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}): React.ReactElement {
  return (
    <span
      className="inline-flex flex-col items-center rounded-xl px-3.5 py-1.5"
      style={{
        background: highlight ? withAlpha(C.info, 0.12) : 'var(--card)',
        border: `1px solid ${highlight ? withAlpha(C.info, 0.4) : 'var(--card-hi)'}`,
      }}
    >
      <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
        {label}
      </span>
      <code className="text-sm font-bold" style={{ color: highlight ? C.info : 'var(--text)' }}>
        {value}
      </code>
    </span>
  )
}

function UpdateNote({ icon, children }: { icon: string; children: React.ReactNode }): React.ReactElement {
  return (
    <li className="flex items-start gap-2.5">
      <span aria-hidden="true" className="shrink-0">
        {icon}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </li>
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

/** Chieu cao chung cua o chon / o nhap / nut trong hang them bo loc. */
const CONTROL_H = 44

const FILTER_PLACEHOLDER: Record<string, string> = {
  keyword_block: 'bạo lực, kinh dị, prank',
  max_duration: '2400',
  min_duration: '45',
  block_live: '1',
  title_regex: '\\b(challenge|24h)\\b',
}

/** Gia tri cua bo loc theo cach bo me doc duoc: "2400" -> "2400 giây (40 phút)". */
function describeFilterValue(rule: FilterRule): string {
  switch (rule.type) {
    case 'max_duration':
    case 'min_duration': {
      const sec = Number(rule.value)
      if (!Number.isFinite(sec) || sec < 60) return `${rule.value} giây`
      return `${sec} giây (${sec % 60 === 0 ? '' : '≈ '}${formatMinutes(sec)})`
    }
    case 'block_live':
      // Server chi chan khi gia tri dung bang '1' (xem services/autofilter.ts).
      return rule.value === '1'
        ? 'Mọi video đang live'
        : `${rule.value} — không có tác dụng, giá trị phải là 1`
    default:
      return rule.value
  }
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
      icon="🧹"
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
      {/*
        Form them bo loc. Huong dan nhap nam DUOI ca hang chu khong nam trong
        o "Giá trị": de trong o thi cot do cao hon cac cot khac, nhan va o nhap
        cua ca hang lech nhau. Boc trong <form> de Enter o o nao cung them duoc.
      */}
      <form
        className="mb-5 rounded-xl px-4 pt-4 pb-3"
        style={{ background: 'var(--bg)', border: '1px solid var(--card)' }}
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        {/*
          Select cua trinh duyet cao hon input cung padding (~48 so voi ~44px)
          -> dat chieu cao chung CONTROL_H cho ca hang, ke ca nut, de mep tren
          cung thang hang. Man hinh hep thi o "Loại" gian het chieu ngang.
        */}
        <div className="flex flex-wrap items-end gap-x-3">
          <div className="shrink-0 basis-[190px] max-sm:grow">
            <Field label="Loại">
              <Select
                value={type}
                onChange={(e) => setType(e.target.value)}
                style={{ height: CONTROL_H }}
              >
                {Object.keys(FILTER_HELP).map((t) => (
                  <option key={t} value={t}>
                    {filterTypeLabel(t)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div style={{ flex: '2 1 220px' }}>
            <Field label="Giá trị">
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={FILTER_PLACEHOLDER[type]}
                style={{ height: CONTROL_H }}
              />
            </Field>
          </div>

          <div style={{ flex: '1 1 160px' }}>
            <Field label="Ghi chú (tuỳ chọn)">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="lý do"
                style={{ height: CONTROL_H }}
              />
            </Field>
          </div>

          {/* mb-4 = khoang cach duoi cua Field -> day nut thang day o nhap.
              Btn khong nhan style, nen cho wrapper flex cao CONTROL_H de nut
              tu gian (align-items: stretch). */}
          <div className="mb-4 flex" style={{ height: CONTROL_H }}>
            <Btn type="submit" variant="primary" disabled={!value.trim()}>
              ➕ Thêm
            </Btn>
          </div>
        </div>

        <p className="-mt-1.5 text-xs" style={{ color: 'var(--text-dim)', lineHeight: 1.5 }}>
          💡 {FILTER_HELP[type]}
        </p>
      </form>

      {/* Chi hien spinner lan dau — bat/tat bo loc cung reload, hien spinner
          moi lan thi danh sach giat xuong roi len. */}
      {loading && !data ? <Spinner /> : null}

      {data ? (
        <h3 className="mb-2 text-sm font-bold">
          Bộ lọc đang có{' '}
          <span style={{ color: 'var(--text-dim)' }}>({data.filters.length})</span>
        </h3>
      ) : null}

      {data && data.filters.length === 0 ? (
        <p className="mb-4 text-sm" style={{ color: 'var(--text-dim)' }}>
          Chưa có bộ lọc nào — mọi video mới đều vào hàng chờ duyệt.
        </p>
      ) : null}

      <div className="mb-4 flex flex-col gap-2">
        {data?.filters.map((f: FilterRule) => {
          const active = f.is_active === 1
          return (
            <div
              key={f.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-4 py-3"
              style={{ background: 'var(--card)' }}
            >
              {/* Chi lam mo phan noi dung khi tat — nut "Bật" van phai ro. */}
              <div
                className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5"
                style={{ flexBasis: 280, opacity: active ? 1 : 0.5 }}
              >
                {/* Cot loai rong co dinh -> gia tri cua moi dong thang hang. */}
                <div className="shrink-0" style={{ width: 160 }}>
                  <Badge color={active ? C.info : C.dim}>{filterTypeLabel(f.type)}</Badge>
                </div>

                <div className="min-w-0 flex-1" style={{ flexBasis: 160 }}>
                  {f.type === 'title_regex' ? (
                    <code className="block truncate text-sm font-bold" title={f.value}>
                      {f.value}
                    </code>
                  ) : (
                    <p className="truncate text-sm font-bold" title={f.value}>
                      {describeFilterValue(f)}
                    </p>
                  )}
                  {f.note ? (
                    <p
                      className="mt-0.5 truncate text-xs"
                      style={{ color: 'var(--text-dim)' }}
                      title={f.note}
                    >
                      {f.note}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="ml-auto flex shrink-0 items-center gap-2">
                <Btn
                  small
                  onClick={() => {
                    void adminApi
                      .updateFilter(f.id, { isActive: !active })
                      .then(reload)
                      .catch(() => toast('error', 'Không đổi được'))
                  }}
                >
                  {active ? '⏸ Tắt' : '▶️ Bật'}
                </Btn>
                <Btn
                  small
                  variant="danger"
                  title="Xoá bộ lọc"
                  aria-label="Xoá bộ lọc"
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
            </div>
          )
        })}
      </div>

      <Alert kind="info">
        Bộ lọc theo <b>độ dài</b> chỉ áp dụng cho video đã biết thời lượng. RSS không trả thời
        lượng, nên nếu không có yt-dlp hoặc API key thì các video đó sẽ bỏ qua bộ lọc độ dài (hiện
        dấu <b>?</b> ở hàng chờ duyệt).
      </Alert>
    </Panel>
  )
}

// ═══ PIN ════════════════════════════════════════════════════════════

const PIN_GRID: React.CSSProperties = {
  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
}

/**
 * Doi PIN, hoac thoi dung PIN.
 *
 * Hai trang thai:
 *   - Dang dung PIN: doi PIN + muc "Không dùng PIN" (phai nhap PIN hien tai).
 *   - Dang tat:      canh bao ro + dat PIN moi de bat lai. Khong hoi "PIN hien
 *                    tai" vi khong co — phien bo me dang mo la du (server
 *                    cung kiem tra nhu vay).
 */
function PinSection(): React.ReactElement {
  const { data: me, error, reload } = useLoad(() => adminApi.me())
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [disablePin, setDisablePin] = useState('')

  function resetFields(): void {
    setCurrent('')
    setNext('')
    setConfirm('')
    setDisablePin('')
  }

  /** Doi PIN khi dang bat, hoac dat PIN moi = bat lai khi dang tat. */
  async function save(enabled: boolean): Promise<void> {
    if (next !== confirm) {
      toast('error', 'Hai lần nhập PIN mới không giống nhau')
      return
    }
    try {
      await adminApi.changePin(enabled ? current : '', next)
      toast(
        'ok',
        enabled
          ? 'Đã đổi PIN. Các thiết bị khác đã bị đăng xuất.'
          : 'Đã bật lại PIN. Các thiết bị khác đã bị đăng xuất.',
      )
      resetFields()
      reload()
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Không lưu được PIN')
    }
  }

  async function turnOff(): Promise<void> {
    const ok = window.confirm(
      'Không dùng PIN nữa?\n\n' +
        'Ai giữ nút ⚙ 3 giây cũng vào được trang bố mẹ — kể cả con, nếu con biết cách. ' +
        'Bạn có thể bật lại PIN bất cứ lúc nào ở đây.',
    )
    if (!ok) return
    try {
      await adminApi.disablePin(disablePin)
      toast('ok', 'Đã tắt PIN — từ giờ giữ nút ⚙ 3 giây là vào thẳng')
      resetFields()
      reload()
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Không tắt được PIN')
    }
  }

  if (!me) {
    return (
      <Panel icon="🔒" title="PIN của bố mẹ">
        {error ? <Alert kind="error">{error}</Alert> : <Spinner />}
      </Panel>
    )
  }

  const newPinFields = (
    <>
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
    </>
  )

  // ─── Dang tat PIN ────────────────────────────────────────────────
  if (!me.pinEnabled) {
    return (
      <Panel icon="🔒" title="PIN của bố mẹ" subtitle="Đang tắt — vào trang bố mẹ không cần PIN">
        <Alert kind="warn">
          Đang <b>không dùng PIN</b>: chỉ cần giữ nút ⚙ 3 giây là vào được trang này — kể cả con,
          nếu con biết cách. Mọi máy trong mạng nhà cũng mở được trang quản trị. Đặt PIN mới bên
          dưới để bật lại.
        </Alert>

        <div className="grid gap-x-4" style={PIN_GRID}>
          {newPinFields}
        </div>

        <Btn
          variant="primary"
          onClick={() => void save(false)}
          disabled={next.length < 4 || !confirm}
        >
          🔒 Bật lại PIN
        </Btn>
      </Panel>
    )
  }

  // ─── Dang dung PIN ───────────────────────────────────────────────
  return (
    <Panel icon="🔒" title="PIN của bố mẹ">
      {me.pinIsDefault ? (
        <Alert kind="warn">
          Bạn đang dùng <b>PIN mặc định</b>. Đổi ngay — ai biết PIN mặc định là vào được trang quản
          trị.
        </Alert>
      ) : null}

      <h3 className="mb-3 text-sm font-bold">Đổi PIN</h3>
      <div className="grid gap-x-4" style={PIN_GRID}>
        <Field label="PIN hiện tại">
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        {newPinFields}
      </div>

      <Btn
        variant="primary"
        onClick={() => void save(true)}
        disabled={!current || next.length < 4 || !confirm}
      >
        🔑 Đổi PIN
      </Btn>

      <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--card)' }}>
        <h3 className="text-sm font-bold">Không dùng PIN</h3>
        <p className="mt-1 mb-3 text-xs" style={{ color: 'var(--text-dim)', lineHeight: 1.5 }}>
          Vào trang bố mẹ chỉ cần giữ nút ⚙ 3 giây, không hỏi PIN. Hợp khi máy chỉ bố mẹ cầm, hoặc
          con còn quá nhỏ. Nhập PIN hiện tại để xác nhận.
        </p>

        {/* Cung cach can hang voi form bo loc: o nhap va nut cao bang nhau,
            mb-4 cua wrapper nut = khoang cach duoi cua Field. */}
        <div className="flex flex-wrap items-end gap-x-3">
          <div style={{ flex: '0 1 240px' }}>
            <Field label="PIN hiện tại">
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={disablePin}
                onChange={(e) => setDisablePin(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && disablePin) void turnOff()
                }}
                style={{ height: CONTROL_H }}
              />
            </Field>
          </div>
          <div className="mb-4 flex" style={{ height: CONTROL_H }}>
            <Btn variant="danger" onClick={() => void turnOff()} disabled={!disablePin}>
              🔓 Không dùng PIN nữa
            </Btn>
          </div>
        </div>
      </div>
    </Panel>
  )
}
