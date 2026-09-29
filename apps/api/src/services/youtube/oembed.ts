import type { IngestedVideo } from '../../db/types.js'
import { fetchJson } from '../../lib/http.js'
import { thumbUrl } from './resolve.js'

/**
 * Endpoint oEmbed cong khai cua YouTube.
 *
 * Day la cach duy nhat lay duoc tieu de + ten kenh cua MOT video le
 * ma khong can API key va khong can yt-dlp. RSS chi lam viec voi
 * kenh/playlist, nen khong dung duoc cho video le.
 *
 * Han che: khong co duration, khong co ngay dang.
 * Tra ve null neu video bi an/xoa/gioi han do tuoi.
 */

interface OEmbedResponse {
  title?: string
  author_name?: string
  author_url?: string
  thumbnail_url?: string
}

export async function fetchOEmbed(videoId: string): Promise<IngestedVideo | null> {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`,
  )}&format=json`

  let data: OEmbedResponse | null
  try {
    data = await fetchJson<OEmbedResponse>(url, { timeoutMs: 12_000, tolerate404: true })
  } catch {
    return null
  }
  if (!data?.title) return null

  // author_url co dang https://www.youtube.com/@handle hoac /channel/UC...
  const chMatch = /\/channel\/(UC[\w-]{22})/.exec(data.author_url ?? '')

  return {
    youtubeId: videoId,
    title: data.title,
    thumbnail: data.thumbnail_url ?? thumbUrl(videoId),
    durationSec: null,
    channelId: chMatch?.[1] ?? null,
    channelTitle: data.author_name ?? null,
    publishedAt: null,
    isLive: false,
  }
}
