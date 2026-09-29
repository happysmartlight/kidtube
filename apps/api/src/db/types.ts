/** Hinh dang cac dong trong DB. SQLite luu boolean duoi dang 0/1. */

export type VideoStatus = 'pending' | 'approved' | 'rejected' | 'later'
export type DownloadStatus = 'none' | 'queued' | 'downloading' | 'done' | 'error'
export type SourceType = 'channel' | 'playlist' | 'video'
export type QueueStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled'
export type FilterType =
  | 'keyword_block'
  | 'max_duration'
  | 'min_duration'
  | 'block_live'
  | 'title_regex'

export interface ProfileRow {
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
  created_at: string
}

export interface SourceRow {
  id: number
  type: SourceType
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
}

export interface VideoRow {
  id: number
  youtube_id: string
  title: string
  thumbnail: string | null
  duration_sec: number | null
  channel_id: string | null
  channel_title: string | null
  published_at: string | null
  source_id: number | null
  status: VideoStatus
  reject_reason: string | null
  is_live: number
  /** null = chua biet, 1 = nhung duoc, 0 = chu kenh chan nhung. */
  embeddable: number | null
  local_path: string | null
  file_size: number | null
  download_status: DownloadStatus
  download_progress: number
  download_error: string | null
  watch_count: number
  last_watched_at: string | null
  added_at: string
  reviewed_at: string | null
}

export interface ShelfRow {
  id: number
  title: string
  emoji: string
  color: string
  position: number
  is_active: number
  created_at: string
}

export interface KidSessionRow {
  id: number
  profile_id: number
  day: string
  started_at: string
  last_seen_at: string
  seconds_used: number
  videos_watched: number
  closed: number
}

export interface DownloadQueueRow {
  id: number
  video_id: number
  priority: number
  status: QueueStatus
  attempts: number
  error: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}

export interface FilterRuleRow {
  id: number
  type: FilterType
  value: string
  note: string | null
  is_active: number
  created_at: string
}

export interface WatchLogRow {
  id: number
  profile_id: number
  video_id: number
  day: string
  started_at: string
  ended_at: string | null
  seconds_watched: number
  completed: number
}

/** Metadata video da chuan hoa, truoc khi ghi vao DB. */
export interface IngestedVideo {
  youtubeId: string
  title: string
  thumbnail: string | null
  durationSec: number | null
  channelId: string | null
  channelTitle: string | null
  publishedAt: string | null
  isLive: boolean
  /** null = chua biet (RSS/oEmbed khong cho biet). */
  embeddable?: boolean | null
}
