/** Dinh dang thoi luong: 8:12 hoac 1:04:30. null -> dau gach. */
export function formatDuration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec) || sec <= 0) return '—'
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  return `${m}:${String(ss).padStart(2, '0')}`
}

/** Dinh dang cho tre/bo me doc: "23 phút", "1 giờ 5 phút". */
export function formatMinutes(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || sec <= 0) return '0 phút'
  const totalMin = Math.round(sec / 60)
  if (totalMin < 60) return `${totalMin} phút`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m === 0 ? `${h} giờ` : `${h} giờ ${m} phút`
}

/** Dem nguoc dang mm:ss cho man hinh sap het gio. */
export function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

/** Ngay thang kieu Viet Nam, tu chuoi datetime cua SQLite (UTC). */
export function formatDate(s: string | null | undefined): string {
  if (!s) return '—'
  const iso = s.includes('T') ? s : s.replace(' ', 'T')
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateShort(s: string | null | undefined): string {
  if (!s) return '—'
  const iso = s.includes('T') ? s : s.replace(' ', 'T')
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/** "2 giờ trước", "3 ngày trước" — de bo me biet nguon cu bao lau chua keo. */
export function formatRelative(s: string | null | undefined): string {
  if (!s) return 'chưa bao giờ'
  const iso = s.includes('T') ? s : s.replace(' ', 'T')
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`)
  if (Number.isNaN(d.getTime())) return '—'

  const diffSec = (Date.now() - d.getTime()) / 1000
  if (diffSec < 60) return 'vừa xong'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`
  if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)} ngày trước`
  return formatDateShort(s)
}

const SOURCE_TYPE_LABEL: Record<string, string> = {
  channel: 'Kênh',
  playlist: 'Playlist',
  video: 'Video lẻ',
}

export function sourceTypeLabel(type: string): string {
  return SOURCE_TYPE_LABEL[type] ?? type
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Đã loại',
  later: 'Để sau',
}

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status
}

const FILTER_LABEL: Record<string, string> = {
  keyword_block: 'Chặn từ khoá',
  max_duration: 'Dài quá',
  min_duration: 'Ngắn quá',
  block_live: 'Chặn phát trực tiếp',
  title_regex: 'Mẫu tiêu đề (regex)',
}

export function filterTypeLabel(type: string): string {
  return FILTER_LABEL[type] ?? type
}
