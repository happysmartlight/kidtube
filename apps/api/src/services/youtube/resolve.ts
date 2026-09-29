import { badRequest, upstream } from '../../lib/errors.js'
import { fetchText } from '../../lib/http.js'
import type { SourceType } from '../../db/types.js'

export interface ResolvedSource {
  type: SourceType
  /** channelId (UC...), playlistId (PL/UU/OL...), hoac videoId (11 ky tu). */
  externalId: string
  /** URL chuan hoa ve dang day du. */
  url: string
  /** Chi co khi da phai tai trang HTML de resolve (tan dung luon, do phai goi lai). */
  title?: string
  thumbnail?: string
}

const VIDEO_ID = /^[\w-]{11}$/
const CHANNEL_ID = /^UC[\w-]{22}$/
const PLAYLIST_ID = /^(?:PL|UU|OL|FL|RD|LL)[\w-]{10,}$/

/**
 * Resolve mot chuoi bat ky (URL day du, URL thieu scheme, @handle, hoac ID tho)
 * thanh nguon co the nhap duoc.
 *
 * Buoc cuoi (@handle, /c/, /user/) phai tai trang HTML vi YouTube khong cung cap
 * cach resolve handle nao khong can API key. Ham nay co goi mang.
 */
export async function resolveSource(input: string): Promise<ResolvedSource> {
  const raw = input.trim()
  if (!raw) throw badRequest('Chưa nhập link')

  // ID tho, dan truc tiep khong kem URL
  if (CHANNEL_ID.test(raw)) return channel(raw)
  if (PLAYLIST_ID.test(raw)) return playlist(raw)

  // @handle dan truc tiep (khong phai URL)
  if (raw.startsWith('@') && !raw.includes('/')) {
    return resolveHandlePage(`https://www.youtube.com/${raw}`)
  }

  const url = parseUrl(raw)
  if (!url) {
    // Chuoi 11 ky tu khong kem gi khac: rat co the la videoId.
    // Kiem tra sau cung vi nhieu handle cung dai 11 ky tu.
    if (VIDEO_ID.test(raw)) return video(raw)
    throw badRequest(`Không nhận diện được link: ${raw}`)
  }

  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '')
  const isYouTube =
    host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com'
  if (!isYouTube) throw badRequest(`Không phải link YouTube: ${url.hostname}`)

  // youtu.be/<videoId>
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0] ?? ''
    if (VIDEO_ID.test(id)) return video(id)
    throw badRequest(`Link youtu.be không có mã video hợp lệ: ${raw}`)
  }

  const segments = url.pathname.split('/').filter(Boolean)
  const first = segments[0] ?? ''

  // Playlist duoc uu tien hon video: link "watch?v=X&list=Y" thuong la
  // nguoi dung muon ca playlist. Tru khi playlist la RD (radio tu sinh cua
  // YouTube) — cai do la thuat toan de xuat, dung nguyen tac P2.
  const list = url.searchParams.get('list')
  if (list && PLAYLIST_ID.test(list) && !list.startsWith('RD')) return playlist(list)

  // /watch?v=
  if (first === 'watch') {
    const v = url.searchParams.get('v') ?? ''
    if (VIDEO_ID.test(v)) return video(v)
    throw badRequest('Link /watch thiếu tham số ?v=')
  }

  // /shorts/<id>, /embed/<id>, /live/<id>, /v/<id>
  if (first === 'shorts' || first === 'embed' || first === 'live' || first === 'v') {
    const id = segments[1] ?? ''
    if (VIDEO_ID.test(id)) return video(id)
    throw badRequest(`Link /${first}/ không có mã video hợp lệ`)
  }

  // /playlist?list=
  if (first === 'playlist') {
    const l = url.searchParams.get('list') ?? ''
    if (PLAYLIST_ID.test(l)) return playlist(l)
    throw badRequest('Link /playlist thiếu tham số ?list=')
  }

  // /channel/UC...
  if (first === 'channel') {
    const id = segments[1] ?? ''
    if (CHANNEL_ID.test(id)) return channel(id)
    throw badRequest(`Mã kênh không hợp lệ: ${id}`)
  }

  // /@handle, /c/<name>, /user/<name> — phai scrape
  if (first.startsWith('@')) return resolveHandlePage(`https://www.youtube.com/${first}`)
  if ((first === 'c' || first === 'user') && segments[1]) {
    return resolveHandlePage(`https://www.youtube.com/${first}/${segments[1]}`)
  }

  throw badRequest(`Không nhận diện được dạng link YouTube: ${url.pathname}`)
}

function parseUrl(raw: string): URL | null {
  for (const candidate of [raw, `https://${raw}`]) {
    try {
      return new URL(candidate)
    } catch {
      /* thu tiep */
    }
  }
  return null
}

function video(id: string): ResolvedSource {
  return { type: 'video', externalId: id, url: `https://www.youtube.com/watch?v=${id}` }
}

function playlist(id: string): ResolvedSource {
  return { type: 'playlist', externalId: id, url: `https://www.youtube.com/playlist?list=${id}` }
}

function channel(id: string): ResolvedSource {
  return { type: 'channel', externalId: id, url: `https://www.youtube.com/channel/${id}` }
}

/**
 * Tai trang kenh va rut channelId. Thu nhieu mau theo do tin cay giam dan:
 *   1. "externalId":"UC..."          — field chinh thuc trong ytInitialData
 *   2. <link rel="canonical" ...>    — URL chuan
 *   3. <meta itemprop="identifier">  — schema.org
 *   4. "channelId":"UC..." dau tien  — chap nhan duoc nhung trang co the chua
 *                                      channelId cua kenh khac (video de xuat)
 */
async function resolveHandlePage(pageUrl: string): Promise<ResolvedSource> {
  const html = await fetchText(pageUrl, { timeoutMs: 20_000, tolerate404: true })
  if (html === null) throw badRequest(`Không tìm thấy kênh: ${pageUrl}`)

  const id =
    match(html, /"externalId"\s*:\s*"(UC[\w-]{22})"/) ??
    match(html, /<link\s+rel="canonical"\s+href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/) ??
    match(html, /<meta\s+itemprop="identifier"\s+content="(UC[\w-]{22})"/) ??
    match(html, /"channelId"\s*:\s*"(UC[\w-]{22})"/)

  if (!id) {
    throw upstream(
      `Không rút được mã kênh từ ${pageUrl}. ` +
        'Thử dán link dạng youtube.com/channel/UC... thay thế.',
    )
  }

  const title =
    match(html, /<meta\s+property="og:title"\s+content="([^"]*)"/) ??
    match(html, /<meta\s+name="title"\s+content="([^"]*)"/) ??
    undefined
  const thumbnail =
    match(html, /<meta\s+property="og:image"\s+content="([^"]*)"/) ?? undefined

  return {
    ...channel(id),
    ...(title ? { title: decodeEntities(title) } : {}),
    ...(thumbnail ? { thumbnail } : {}),
  }
}

function match(s: string, re: RegExp): string | null {
  return re.exec(s)?.[1] ?? null
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&') // phai de cuoi
}

/**
 * Chuyen channelId thanh playlistId cua muc "Uploads".
 * UCxxxx -> UUxxxx. Day la quy uoc on dinh cua YouTube tu lau,
 * cho phep doc toan bo video da dang cua kenh qua API playlist.
 */
export function uploadsPlaylistId(channelId: string): string {
  return `UU${channelId.slice(2)}`
}

/** Thumbnail suy ra tu videoId — khong can goi API. */
export function thumbUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}
