import type { IngestedVideo } from '../../db/types.js'
import { fetchText } from '../../lib/http.js'
import { decodeEntities, thumbUrl } from './resolve.js'

/**
 * Doc Atom feed cong khai cua YouTube.
 *
 * Uu: mien phi, khong can API key, khong quota.
 * Nhuoc: CHI 15 video moi nhat, va KHONG co duration.
 *        duration duoc bu sau boi yt-dlp hoac Data API (xem ingest.ts).
 */

export interface RssFeed {
  title: string | null
  channelId: string | null
  videos: IngestedVideo[]
}

export function channelFeedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`
}

export function playlistFeedUrl(playlistId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(playlistId)}`
}

export async function fetchFeed(url: string): Promise<RssFeed | null> {
  const xml = await fetchText(url, { timeoutMs: 20_000, tolerate404: true })
  if (xml === null) return null
  return parseFeed(xml)
}

/**
 * Quirk cua YouTube: <yt:channelId> o CAP FEED bi thieu tien to "UC"
 * (tra ve "bCmjCu..." thay vi "UCbCmjCu..."), trong khi cap <entry> thi dung.
 * Chuan hoa lai, neu khong thi ingest se gan channelId sai cho video.
 */
function normalizeChannelId(id: string | null): string | null {
  if (!id) return null
  if (id.startsWith('UC')) return id
  // channelId day du dai 24 ky tu (UC + 22). Ban bi cat con dung 22.
  if (id.length === 22) return `UC${id}`
  return id
}

export function parseFeed(xml: string): RssFeed {
  // Feed cua kenh co <title> cap feed truoc <entry> dau tien.
  const head = xml.split('<entry>')[0] ?? xml
  const feedTitle = tag(head, 'title')
  const feedChannel = normalizeChannelId(tag(head, 'yt:channelId'))

  const videos: IngestedVideo[] = []
  for (const entry of xml.split('<entry>').slice(1)) {
    const youtubeId = tag(entry, 'yt:videoId')
    if (!youtubeId) continue

    const title = tag(entry, 'title') ?? ''
    const channelId = normalizeChannelId(tag(entry, 'yt:channelId')) ?? feedChannel
    // <author><name>...</name></author>
    const channelTitle = tag(entry.split('</author>')[0] ?? '', 'name')
    const published = tag(entry, 'published')
    const mediaThumb = attr(entry, 'media:thumbnail', 'url')

    videos.push({
      youtubeId,
      title: decodeEntities(title),
      thumbnail: mediaThumb ?? thumbUrl(youtubeId),
      durationSec: null, // RSS khong cung cap
      channelId: channelId ?? null,
      channelTitle: channelTitle ? decodeEntities(channelTitle) : null,
      publishedAt: published ?? null,
      // Feed khong noi ro video co dang live khong. Bo loc block_live chi
      // co hieu luc khi metadata den tu yt-dlp/Data API.
      isLive: false,
    })
  }

  return {
    title: feedTitle ? decodeEntities(feedTitle) : null,
    channelId: feedChannel ?? null,
    videos,
  }
}

function tag(s: string, name: string): string | null {
  const re = new RegExp(`<${escapeRe(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeRe(name)}>`)
  const m = re.exec(s)
  if (!m?.[1]) return null
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim()
}

function attr(s: string, tagName: string, attrName: string): string | null {
  const re = new RegExp(`<${escapeRe(tagName)}\\b[^>]*\\b${escapeRe(attrName)}="([^"]*)"`)
  return re.exec(s)?.[1] ?? null
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
