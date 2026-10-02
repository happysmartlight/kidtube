/**
 * Client goi API. Mot cho duy nhat dinh nghia moi endpoint —
 * de doi duong dan la sua mot noi.
 */

// ─── Cap nhat app ──────────────────────────────────────────────────

export interface UpdateSnapshot {
  running: {
    version: string
    commit: string | null
    commitShort: string | null
    builtAt: string | null
  }
  updater: {
    installed: boolean
    online: boolean
    phase: 'idle' | 'checking' | 'updating'
    pendingRequest: boolean
    heartbeatAt: string | null
    repoOk: boolean
    repoDir: string | null
    repoError: string | null
  }
  repo: {
    branch: string
    upstream: string | null
    head: string
    headShort: string
    headSubject: string
    headDate: string
    dirty: boolean
    behind: number
    pending: Array<{ short: string; subject: string }>
    checkedAt: string
    fetchError: string | null
  } | null
  deployedCommit: string | null
  lastRun: {
    action: string
    startedAt: string
    finishedAt: string
    ok: boolean
    step: string
    error: string | null
    fromCommit: string | null
    toCommit: string | null
  } | null
  log: string | null
  warnings: {
    activeKidSessions: number
    downloadRunning: boolean
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = opts

  const headers: Record<string, string> = {}
  // CHI dat content-type khi that su co body. Backend coi body rong la {},
  // nhung khong gui header du la sach hon.
  if (body !== undefined) headers['content-type'] = 'application/json'

  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin', // cookie phien cua bo me
    signal,
  })

  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { error: text }
    }
  }

  if (!res.ok) {
    const d = data as { error?: string; code?: string } | null
    throw new ApiError(res.status, d?.error ?? `Lỗi HTTP ${res.status}`, d?.code)
  }

  return data as T
}

// ═══ Kieu du lieu chia se ═══════════════════════════════════════════

export interface KidVideo {
  id: number
  youtubeId: string
  title: string
  thumbnail: string | null
  durationSec: number | null
  channelTitle: string | null
  hasLocal: boolean
  isFavorite: boolean
}

/** Mot trang video cua mot ke hoac mot kenh. */
export interface KidShelfPage {
  shelf: { id: number; title: string; emoji: string; color: string }
  videos: KidVideo[]
  total: number
  offset: number
  hasMore: boolean
  quota: Quota
}

export interface Quota {
  allowed: boolean
  reason:
    | 'outside_window'
    | 'daily_limit'
    | 'session_limit'
    | 'video_limit'
    | 'profile_inactive'
    | null
  message: string | null
  dailyLimitSec: number
  dailyUsedSec: number
  dailyRemainingSec: number | null
  sessionLimitSec: number
  sessionUsedSec: number
  sessionRemainingSec: number | null
  videoLimit: number
  videosWatched: number
  videosRemaining: number | null
  allowedFrom: string
  allowedTo: string
  warnAtSec: number
  warning: boolean
}

export interface KidProfile {
  id: number
  name: string
  avatar: string
  color: string
}

export interface KidConfig {
  uiModeOverride: 'auto' | 'touch' | 'tv'
  sfxEnabled: boolean
  showDuration: boolean
  showDownloadBadge: boolean
  warnBeforeMin: number
}

export interface PlaybackInfo {
  blocked: boolean
  quota: Quota
  video: (KidVideo & { localUrl: string | null }) | null
  next: KidVideo | null
  autoplay?: boolean
  autoplayMax?: number
}

// ═══ API cho tre ════════════════════════════════════════════════════

export const kidApi = {
  config: () => request<KidConfig>('/api/kid/config'),

  profiles: () => request<{ profiles: KidProfile[] }>('/api/kid/profiles'),

  quota: (profileId: number) => request<{ quota: Quota }>(`/api/kid/quota?profileId=${profileId}`),

  favorites: (profileId: number) =>
    request<{ videos: KidVideo[] }>(`/api/kid/favorites?profileId=${profileId}`),

  /** Danh sach kenh, khong kem video — doi xung voi `shelves`. */
  channels: (profileId: number) =>
    request<{
      channels: Array<{ id: number; title: string; thumbnail: string | null; total: number }>
      /**
       * Tong video be xem duoc — cho nut "Tất cả". KHONG bang tong cac kenh:
       * con video cua nguon da tat / da xoa, khong thuoc kenh nao trong danh sach.
       */
      total: number
      quota: Quota
    }>(`/api/kid/channels?profileId=${profileId}`),

  /** Danh sach ke, khong kem video — dung cho hang nut chon chu de. */
  shelves: (profileId: number) =>
    request<{
      shelves: Array<{ id: number; title: string; emoji: string; color: string; total: number }>
      quota: Quota
    }>(`/api/kid/shelves?profileId=${profileId}`),

  /**
   * Video da duyet, tron ngau nhien. `seed` quyet dinh thu tu — giu nguyen
   * seed khi "Xem thêm" (khong lap video), doi seed khi "Làm mới".
   * `sourceId = 0` = tron toan bo, khong loc kenh.
   */
  discover: (
    profileId: number,
    opts: { seed: number; sourceId?: number; offset?: number; limit?: number } ,
  ) => {
    const qs = new URLSearchParams({
      profileId: String(profileId),
      seed: String(opts.seed),
      offset: String(opts.offset ?? 0),
      limit: String(opts.limit ?? 60),
    })
    if (opts.sourceId) qs.set('sourceId', String(opts.sourceId))
    return request<{
      videos: KidVideo[]
      total: number
      offset: number
      hasMore: boolean
      quota: Quota
    }>(`/api/kid/discover?${qs}`)
  },

  /** Mot trang video cua mot ke. */
  shelf: (shelfId: number, profileId: number, offset = 0, limit = 60) =>
    request<KidShelfPage>(
      `/api/kid/shelf/${shelfId}?profileId=${profileId}&offset=${offset}&limit=${limit}`,
    ),


  video: (id: number, profileId: number) =>
    request<PlaybackInfo>(`/api/kid/video/${id}?profileId=${profileId}`),

  watchStart: (profileId: number, videoId: number) =>
    request<{ logId: number | null; quota: Quota }>('/api/kid/watch/start', {
      method: 'POST',
      body: { profileId, videoId },
    }),

  heartbeat: (profileId: number, logId: number | null, seconds: number) =>
    request<{ quota: Quota }>('/api/kid/watch/heartbeat', {
      method: 'POST',
      body: { profileId, logId, seconds },
    }),

  watchEnd: (profileId: number, logId: number | null, completed: boolean) =>
    request<{ quota: Quota }>('/api/kid/watch/end', {
      method: 'POST',
      body: { profileId, logId, completed },
    }),

  toggleFavorite: (profileId: number, videoId: number) =>
    request<{ isFavorite: boolean }>('/api/kid/favorite', {
      method: 'POST',
      body: { profileId, videoId },
    }),

  /** Bao lai rang YouTube tu choi nhung video nay (ma loi 101/150). */
  reportEmbedBlocked: (profileId: number, videoId: number) =>
    request<{ ok: boolean }>(`/api/kid/video/${videoId}/embed-blocked`, {
      method: 'POST',
      body: { profileId },
    }),

  closeSession: (profileId: number) =>
    request<{ ok: boolean }>('/api/kid/session/close', { method: 'POST', body: { profileId } }),
}

// ═══ Kieu du lieu quan tri ══════════════════════════════════════════

export interface AdminSource {
  id: number
  type: 'channel' | 'playlist' | 'video'
  external_id: string
  title: string
  thumbnail: string | null
  url: string
  auto_pull: number
  auto_approve: number
  last_pulled_at: string | null
  last_error: string | null
  is_active: number
  created_at: string
  video_count: number
  pending_count: number
  /** So video DA DUYET — dung cho "thêm cả kênh vào kệ". */
  approved_count: number
}

export interface AdminVideo {
  id: number
  youtube_id: string
  title: string
  thumbnail: string | null
  duration_sec: number | null
  channel_title: string | null
  published_at: string | null
  source_id: number | null
  source_title: string | null
  status: 'pending' | 'approved' | 'rejected' | 'later'
  reject_reason: string | null
  is_live: number
  /** null = chua biet, 1 = nhung duoc, 0 = chu kenh chan nhung ra ngoai YouTube. */
  embeddable: number | null
  local_path: string | null
  file_size: number | null
  download_status: 'none' | 'queued' | 'downloading' | 'done' | 'error'
  download_progress: number
  download_error: string | null
  watch_count: number
  shelf_count: number
  added_at: string
}

export interface AdminShelf {
  id: number
  title: string
  emoji: string
  color: string
  position: number
  is_active: number
  item_count: number
  profileIds: number[]
}

export interface AdminProfile {
  id: number
  name: string
  avatar: string
  color: string
  daily_limit_min: number
  session_limit_min: number
  video_limit_session: number
  allowed_from: string
  allowed_to: string
  autoplay: number
  autoplay_max: number
  position: number
  is_active: number
  quota: Quota
}

export interface FilterRule {
  id: number
  type: 'keyword_block' | 'max_duration' | 'min_duration' | 'block_live' | 'title_regex'
  value: string
  note: string | null
  is_active: number
}

export interface SourcePreview {
  resolved: {
    type: 'channel' | 'playlist' | 'video'
    externalId: string
    url: string
    title: string
    thumbnail: string | null
  }
  sampleCount: number
  notes: string[]
  alreadyExists: { id: number; title: string } | null
}

export interface IngestResult {
  sourceId: number
  added: number
  updated: number
  autoRejected: number
  fetched: number
  via: string[]
  warnings: string[]
}

export interface SystemInfo {
  ytdlpAvailable: boolean
  ytdlpVersion: string | null
  hasApiKey: boolean
  mediaDir: string
  dataDir: string
  downloadMaxHeight: number
  storage: { usedBytes: number; limitBytes: number; fileCount: number }
  nodeVersion: string
}

export interface DashboardStats {
  pendingCount: number
  approvedCount: number
  rejectedCount: number
  sourceCount: number
  shelfCount: number
  todayByProfile: Array<{
    day: string
    profileId: number
    profileName: string
    avatar: string
    seconds: number
    videos: number
  }>
  storageUsedBytes: number
  storageFileCount: number
  downloadQueued: number
  downloadErrors: number
}

export interface DownloadQueueItem {
  id: number
  video_id: number
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled'
  attempts: number
  error: string | null
  title: string
  thumbnail: string | null
  progress: number
}

// ═══ API quan tri ═══════════════════════════════════════════════════

export const adminApi = {
  me: () => request<{ authenticated: boolean; pinIsDefault: boolean }>('/api/admin/me'),

  login: (pin: string) =>
    request<{ ok: boolean; pinIsDefault: boolean }>('/api/admin/login', {
      method: 'POST',
      body: { pin },
    }),

  logout: () => request<{ ok: boolean }>('/api/admin/logout', { method: 'POST' }),

  changePin: (currentPin: string, newPin: string) =>
    request<{ ok: boolean }>('/api/admin/pin', { method: 'POST', body: { currentPin, newPin } }),

  // Nguon
  sources: () => request<{ sources: AdminSource[] }>('/api/admin/sources'),

  previewSource: (url: string) =>
    request<SourcePreview>('/api/admin/sources/preview', { method: 'POST', body: { url } }),

  addSource: (url: string, opts: { autoPull?: boolean; autoApprove?: boolean } = {}) =>
    request<{ source: AdminSource; ingest: IngestResult | null }>('/api/admin/sources', {
      method: 'POST',
      body: { url, ...opts },
    }),

  updateSource: (
    id: number,
    body: { autoPull?: boolean; autoApprove?: boolean; isActive?: boolean; title?: string },
  ) => request<{ source: AdminSource }>(`/api/admin/sources/${id}`, { method: 'PATCH', body }),

  pullSource: (id: number, full = false) =>
    request<{ result: IngestResult }>(`/api/admin/sources/${id}/pull?full=${full ? 1 : 0}`, {
      method: 'POST',
    }),

  deleteSource: (id: number, withVideos = false) =>
    request<{ ok: boolean; deletedVideos: number }>(
      `/api/admin/sources/${id}?withVideos=${withVideos ? 1 : 0}`,
      { method: 'DELETE' },
    ),

  // Video
  videos: (params: {
    status?: string
    sourceId?: number
    q?: string
    limit?: number
    offset?: number
    sort?: string
  }) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') qs.set(k, String(v))
    }
    return request<{
      videos: AdminVideo[]
      total: number
      offset: number
      limit: number
      hasMore: boolean
      counts: Record<string, number>
    }>(`/api/admin/videos?${qs}`)
  },

  reviewVideo: (id: number, status: string, enqueueDownload = false) =>
    request<{ video: AdminVideo }>(`/api/admin/videos/${id}`, {
      method: 'PATCH',
      body: { status, enqueueDownload },
    }),

  bulkReview: (ids: number[], status: string, enqueueDownload = false) =>
    request<{ ok: boolean; updated: number }>('/api/admin/videos/bulk', {
      method: 'POST',
      body: { ids, status, enqueueDownload },
    }),

  refilter: (onlyPending = true) =>
    request<{ ok: boolean; scanned: number; blocked: number }>('/api/admin/videos/refilter', {
      method: 'POST',
      body: { onlyPending },
    }),

  deleteVideo: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/videos/${id}`, { method: 'DELETE' }),

  // Ke
  shelves: () => request<{ shelves: AdminShelf[] }>('/api/admin/shelves'),

  shelfItems: (id: number) =>
    request<{ shelf: AdminShelf; items: AdminVideo[] }>(`/api/admin/shelves/${id}/items`),

  createShelf: (body: { title: string; emoji?: string; color?: string }) =>
    request<{ shelf: AdminShelf }>('/api/admin/shelves', { method: 'POST', body }),

  updateShelf: (
    id: number,
    body: {
      title?: string
      emoji?: string
      color?: string
      isActive?: boolean
      profileIds?: number[]
    },
  ) => request<{ shelf: AdminShelf }>(`/api/admin/shelves/${id}`, { method: 'PATCH', body }),

  deleteShelf: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/shelves/${id}`, { method: 'DELETE' }),

  reorderShelves: (order: number[]) =>
    request<{ ok: boolean }>('/api/admin/shelves/reorder', { method: 'POST', body: { order } }),

  addToShelf: (shelfId: number, videoIds: number[]) =>
    request<{ ok: boolean; added: number; skipped: number }>(
      `/api/admin/shelves/${shelfId}/items`,
      { method: 'POST', body: { videoIds } },
    ),

  /** Xep TAT CA video da duyet cua mot kenh vao ke, trong mot thao tac. */
  addSourceToShelf: (shelfId: number, sourceId: number) =>
    request<{ ok: boolean; added: number; skipped: number }>(
      `/api/admin/shelves/${shelfId}/items`,
      { method: 'POST', body: { sourceId } },
    ),

  removeFromShelf: (shelfId: number, videoId: number) =>
    request<{ ok: boolean }>(`/api/admin/shelves/${shelfId}/items/${videoId}`, {
      method: 'DELETE',
    }),

  reorderShelfItems: (shelfId: number, order: number[]) =>
    request<{ ok: boolean }>(`/api/admin/shelves/${shelfId}/reorder`, {
      method: 'POST',
      body: { order },
    }),

  // Be
  profiles: () => request<{ profiles: AdminProfile[] }>('/api/admin/profiles'),

  createProfile: (body: Record<string, unknown>) =>
    request<{ profile: AdminProfile }>('/api/admin/profiles', { method: 'POST', body }),

  updateProfile: (id: number, body: Record<string, unknown>) =>
    request<{ profile: AdminProfile }>(`/api/admin/profiles/${id}`, { method: 'PATCH', body }),

  deleteProfile: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/profiles/${id}`, { method: 'DELETE' }),

  grantMinutes: (id: number, minutes: number) =>
    request<{ ok: boolean; quota: Quota }>(`/api/admin/profiles/${id}/grant`, {
      method: 'POST',
      body: { minutes },
    }),

  endSession: (id: number) =>
    request<{ ok: boolean; quota: Quota }>(`/api/admin/profiles/${id}/end-session`, {
      method: 'POST',
    }),

  // Cai dat
  settings: () =>
    request<{ settings: Record<string, string>; system: SystemInfo }>('/api/admin/settings'),

  updateSettings: (body: Record<string, unknown>) =>
    request<{ ok: boolean; applied: string[]; ignored: string[] }>('/api/admin/settings', {
      method: 'PATCH',
      body,
    }),

  // Bo loc
  filters: () => request<{ filters: FilterRule[] }>('/api/admin/filters'),

  createFilter: (body: { type: string; value: string; note?: string }) =>
    request<{ filter: FilterRule }>('/api/admin/filters', { method: 'POST', body }),

  updateFilter: (id: number, body: { isActive?: boolean; value?: string; note?: string }) =>
    request<{ filter: FilterRule }>(`/api/admin/filters/${id}`, { method: 'PATCH', body }),

  deleteFilter: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/filters/${id}`, { method: 'DELETE' }),

  // Tai offline
  downloads: () =>
    request<{
      queue: DownloadQueueItem[]
      downloaded: Array<{
        id: number
        title: string
        thumbnail: string | null
        file_size: number | null
        local_path: string | null
        watch_count: number
      }>
      storage: { usedBytes: number; limitBytes: number; fileCount: number }
      worker: {
        busy: boolean
        currentVideoId: number | null
        offlineEnabled: boolean
        ytdlpAvailable: boolean
      }
    }>('/api/admin/downloads'),

  enqueueDownloads: (videoIds: number[], priority = 0) =>
    request<{
      results: Array<{ videoId: number; queued: boolean; reason?: string }>
      notice: string | null
    }>('/api/admin/downloads', { method: 'POST', body: { videoIds, priority } }),

  cancelDownload: (videoId: number) =>
    request<{ ok: boolean }>(`/api/admin/downloads/${videoId}`, { method: 'DELETE' }),

  deleteDownloadedFile: (videoId: number) =>
    request<{ ok: boolean }>(`/api/admin/downloads/${videoId}/file`, { method: 'DELETE' }),

  enqueueFavorites: () =>
    request<{ ok: boolean; enqueued: number; candidates: number; notice: string | null }>(
      '/api/admin/downloads/enqueue-favorites',
      { method: 'POST' },
    ),

  cleanupDownloads: () =>
    request<{ ok: boolean; orphansRemoved: number; evictedForSpace: number }>(
      '/api/admin/downloads/cleanup',
      { method: 'POST' },
    ),

  // Thong ke
  stats: () => request<DashboardStats>('/api/admin/stats'),

  statsDays: (days = 14) =>
    request<{ days: Array<{ day: string; seconds: number; videos: number }> }>(
      `/api/admin/stats/days?days=${days}`,
    ),

  statsTop: (limit = 10) =>
    request<{
      videos: Array<{
        videoId: number
        title: string
        thumbnail: string | null
        plays: number
        seconds: number
      }>
    }>(`/api/admin/stats/top?limit=${limit}`),

  statsHistory: (limit = 100, profileId?: number) =>
    request<{
      entries: Array<{
        id: number
        videoId: number
        title: string
        thumbnail: string | null
        profileName: string
        avatar: string
        startedAt: string
        secondsWatched: number
        completed: number
      }>
    }>(`/api/admin/stats/history?limit=${limit}${profileId ? `&profileId=${profileId}` : ''}`),

  // Cap nhat app. `signal` de huy khi server dang khoi dong lai giua chung.
  update: (signal?: AbortSignal) => request<UpdateSnapshot>('/api/admin/update', { signal }),

  checkUpdate: () => request<{ ok: boolean }>('/api/admin/update/check', { method: 'POST' }),

  runUpdate: () => request<{ ok: boolean }>('/api/admin/update/run', { method: 'POST' }),
}
