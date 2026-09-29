import { env } from '../../env.js'
import type { IngestedVideo } from '../../db/types.js'
import { fetchJson } from '../../lib/http.js'
import { parseIsoDuration } from '../../lib/time.js'
import { thumbUrl, uploadsPlaylistId } from './resolve.js'

/**
 * YouTube Data API v3 — TUY CHON, chi dung khi bo me cung cap YT_API_KEY.
 *
 * Chi phi quota (mac dinh 10.000 don vi/ngay — rat du):
 *   playlistItems.list  1 don vi
 *   videos.list         1 don vi
 *   channels.list       1 don vi
 * Ta CO Y khong dung search.list (100 don vi) — dat va khong can thiet.
 */

export function hasApiKey(): boolean {
  return env.ytApiKey.length > 0
}

const BASE = 'https://www.googleapis.com/youtube/v3'

interface PlaylistItemsResponse {
  nextPageToken?: string
  items?: Array<{
    snippet?: {
      title?: string
      publishedAt?: string
      channelId?: string
      channelTitle?: string
      videoOwnerChannelId?: string
      videoOwnerChannelTitle?: string
      thumbnails?: Record<string, { url?: string }>
      resourceId?: { videoId?: string }
    }
  }>
}

interface VideosResponse {
  items?: Array<{
    id?: string
    snippet?: {
      title?: string
      publishedAt?: string
      channelId?: string
      channelTitle?: string
      liveBroadcastContent?: string
      thumbnails?: Record<string, { url?: string }>
    }
    contentDetails?: { duration?: string }
    status?: { embeddable?: boolean }
  }>
}

interface ChannelsResponse {
  items?: Array<{
    id?: string
    snippet?: { title?: string; thumbnails?: Record<string, { url?: string }> }
  }>
}

function bestThumb(thumbs: Record<string, { url?: string }> | undefined): string | null {
  if (!thumbs) return null
  for (const key of ['maxres', 'standard', 'high', 'medium', 'default']) {
    const url = thumbs[key]?.url
    if (url) return url
  }
  return null
}

/** Doc cac muc trong playlist. `channelId` duoc doi thanh uploads playlist tu dong. */
export async function listPlaylistItems(
  playlistOrChannelId: string,
  maxItems = 100,
): Promise<IngestedVideo[]> {
  if (!hasApiKey()) return []

  const playlistId = playlistOrChannelId.startsWith('UC')
    ? uploadsPlaylistId(playlistOrChannelId)
    : playlistOrChannelId

  const out: IngestedVideo[] = []
  let pageToken: string | undefined

  while (out.length < maxItems) {
    const params = new URLSearchParams({
      part: 'snippet',
      playlistId,
      maxResults: String(Math.min(50, maxItems - out.length)),
      key: env.ytApiKey,
    })
    if (pageToken) params.set('pageToken', pageToken)

    const data = await fetchJson<PlaylistItemsResponse>(
      `${BASE}/playlistItems?${params}`,
      { tolerate404: true },
    )
    if (!data?.items?.length) break

    for (const item of data.items) {
      const s = item.snippet
      const id = s?.resourceId?.videoId
      if (!id) continue
      out.push({
        youtubeId: id,
        title: s?.title ?? id,
        thumbnail: bestThumb(s?.thumbnails) ?? thumbUrl(id),
        durationSec: null, // playlistItems khong tra duration
        channelId: s?.videoOwnerChannelId ?? s?.channelId ?? null,
        channelTitle: s?.videoOwnerChannelTitle ?? s?.channelTitle ?? null,
        publishedAt: s?.publishedAt ?? null,
        isLive: false,
      })
    }

    pageToken = data.nextPageToken
    if (!pageToken) break
  }

  return out
}

/**
 * Lay chi tiet video ke ca duration va trang thai live.
 * videos.list nhan toi 50 id moi lan goi.
 */
export async function listVideoDetails(videoIds: string[]): Promise<IngestedVideo[]> {
  if (!hasApiKey() || videoIds.length === 0) return []

  const out: IngestedVideo[] = []
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50)
    const params = new URLSearchParams({
      part: 'snippet,contentDetails,status',
      id: batch.join(','),
      key: env.ytApiKey,
    })
    const data = await fetchJson<VideosResponse>(`${BASE}/videos?${params}`, {
      tolerate404: true,
    })
    if (!data?.items?.length) continue

    for (const item of data.items) {
      const id = item.id
      if (!id) continue
      const s = item.snippet
      const iso = item.contentDetails?.duration
      out.push({
        youtubeId: id,
        title: s?.title ?? id,
        thumbnail: bestThumb(s?.thumbnails) ?? thumbUrl(id),
        durationSec: iso ? parseIsoDuration(iso) : null,
        channelId: s?.channelId ?? null,
        channelTitle: s?.channelTitle ?? null,
        publishedAt: s?.publishedAt ?? null,
        isLive: s?.liveBroadcastContent === 'live' || s?.liveBroadcastContent === 'upcoming',
        // Day la cach DUY NHAT biet truoc video co nhung duoc khong ma
        // khong phai thu mo iframe that. Chi co khi bo me cap YT_API_KEY.
        embeddable: item.status?.embeddable ?? null,
      })
    }
  }
  return out
}

export async function getChannelInfo(
  channelId: string,
): Promise<{ title: string; thumbnail: string | null } | null> {
  if (!hasApiKey()) return null
  const params = new URLSearchParams({ part: 'snippet', id: channelId, key: env.ytApiKey })
  const data = await fetchJson<ChannelsResponse>(`${BASE}/channels?${params}`, {
    tolerate404: true,
  })
  const item = data?.items?.[0]
  if (!item?.snippet?.title) return null
  return { title: item.snippet.title, thumbnail: bestThumb(item.snippet.thumbnails) }
}
