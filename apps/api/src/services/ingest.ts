import { getDb } from '../db/index.js'
import type { IngestedVideo, SourceRow } from '../db/types.js'
import { notFound } from '../lib/errors.js'
import { buildSearchText } from '../lib/search.js'
import { sqlNow } from '../lib/time.js'
import { activeRules, evaluate } from './autofilter.js'
import { hasApiKey, listPlaylistItems, listVideoDetails } from './youtube/dataapi.js'
import { fetchOEmbed } from './youtube/oembed.js'
import { channelFeedUrl, fetchFeed, playlistFeedUrl } from './youtube/rss.js'
import { uploadsPlaylistId } from './youtube/resolve.js'
import { fetchVideoMeta, listPlaylist, ytdlpAvailable } from './youtube/ytdlp.js'

export interface IngestResult {
  sourceId: number
  added: number
  updated: number
  autoRejected: number
  fetched: number
  /** Duong lay du lieu da thuc su dung, theo thu tu. */
  via: string[]
  warnings: string[]
}

export interface IngestOptions {
  /** So video toi da lay ve. */
  limit?: number
  /**
   * true = co gang lay toan bo lich su (can yt-dlp hoac Data API).
   * false = chi lay video moi (RSS, 15 cai) — dung cho cron.
   */
  full?: boolean
}

/**
 * Keo video ve cho mot nguon.
 *
 * Chien luoc theo thu tu uu tien:
 *   channel/playlist  RSS (nhanh, mien phi, 15 moi nhat)
 *                     -> Data API hoac yt-dlp neu can full history
 *   video le          oEmbed (mien phi) -> Data API/yt-dlp de bu duration
 *
 * Sau khi upsert, duration thieu se duoc bu bang Data API (re) roi yt-dlp.
 */
export async function ingestSource(
  sourceId: number,
  opts: IngestOptions = {},
): Promise<IngestResult> {
  const db = getDb()
  const source = db
    .prepare<[number], SourceRow>('SELECT * FROM sources WHERE id = ?')
    .get(sourceId)
  if (!source) throw notFound(`Không có nguồn id=${sourceId}`)

  const limit = opts.limit ?? (opts.full ? 200 : 50)
  const via: string[] = []
  const warnings: string[] = []
  let items: IngestedVideo[] = []

  try {
    if (source.type === 'video') {
      const one = await ingestSingleVideo(source.external_id, via, warnings)
      if (one) items = [one]
    } else {
      items = await ingestCollection(source, limit, Boolean(opts.full), via, warnings)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    db.prepare('UPDATE sources SET last_error = ?, last_pulled_at = ? WHERE id = ?').run(
      msg,
      sqlNow(),
      sourceId,
    )
    throw err
  }

  // Bu duration cho nhung video chua co — bo loc do dai phu thuoc vao no.
  items = await backfillDurations(items, via, warnings)

  const result = upsertVideos(items, source)

  db.prepare('UPDATE sources SET last_pulled_at = ?, last_error = NULL WHERE id = ?').run(
    sqlNow(),
    sourceId,
  )

  return { sourceId, fetched: items.length, via, warnings, ...result }
}

async function ingestSingleVideo(
  videoId: string,
  via: string[],
  warnings: string[],
): Promise<IngestedVideo | null> {
  if (hasApiKey()) {
    const [detail] = await listVideoDetails([videoId])
    if (detail) {
      via.push('dataapi')
      return detail
    }
  }

  const oembed = await fetchOEmbed(videoId)
  if (oembed) {
    via.push('oembed')
    return oembed
  }

  if (await ytdlpAvailable()) {
    const [meta] = await fetchVideoMeta([videoId])
    if (meta) {
      via.push('ytdlp')
      return meta
    }
  }

  warnings.push(
    `Không lấy được thông tin video ${videoId}. ` +
      'Có thể video đã bị xoá, để riêng tư, hoặc giới hạn độ tuổi.',
  )
  return null
}

async function ingestCollection(
  source: SourceRow,
  limit: number,
  full: boolean,
  via: string[],
  warnings: string[],
): Promise<IngestedVideo[]> {
  const isChannel = source.type === 'channel'

  // Duong nhanh: RSS. Du cho cron chay dinh ky vi chi can biet video MOI.
  if (!full) {
    const feedUrl = isChannel
      ? channelFeedUrl(source.external_id)
      : playlistFeedUrl(source.external_id)
    const feed = await fetchFeed(feedUrl)
    if (feed && feed.videos.length > 0) {
      via.push('rss')
      return feed.videos.slice(0, limit)
    }
    warnings.push('RSS không trả về video nào, thử cách khác.')
  }

  // Duong day du: Data API (re hon, on dinh hon) truoc, roi yt-dlp.
  if (hasApiKey()) {
    const target = isChannel ? uploadsPlaylistId(source.external_id) : source.external_id
    const items = await listPlaylistItems(target, limit)
    if (items.length > 0) {
      via.push('dataapi')
      return items
    }
  }

  if (await ytdlpAvailable()) {
    const url = isChannel
      ? `https://www.youtube.com/channel/${source.external_id}/videos`
      : `https://www.youtube.com/playlist?list=${source.external_id}`
    const items = await listPlaylist(url, limit)
    if (items.length > 0) {
      via.push('ytdlp')
      return items
    }
  }

  // Phuong an cuoi: RSS (neu nay gio chua thu vi full=true).
  if (full) {
    const feed = await fetchFeed(
      isChannel ? channelFeedUrl(source.external_id) : playlistFeedUrl(source.external_id),
    )
    if (feed && feed.videos.length > 0) {
      via.push('rss')
      warnings.push(
        'Chỉ lấy được 15 video mới nhất qua RSS. ' +
          'Cài yt-dlp hoặc thêm YT_API_KEY để lấy toàn bộ lịch sử kênh.',
      )
      return feed.videos
    }
  }

  warnings.push('Không lấy được video nào từ nguồn này.')
  return []
}

/**
 * Bu `durationSec` cho video chua co. Data API re (1 don vi/50 video) nen thu truoc;
 * yt-dlp cham hon nhieu (phai spawn process va tai trang moi video).
 */
async function backfillDurations(
  items: IngestedVideo[],
  via: string[],
  warnings: string[],
): Promise<IngestedVideo[]> {
  const missing = items.filter((v) => v.durationSec === null)
  if (missing.length === 0) return items

  const byId = new Map(items.map((v) => [v.youtubeId, v]))
  const ids = missing.map((v) => v.youtubeId)

  if (hasApiKey()) {
    try {
      for (const detail of await listVideoDetails(ids)) {
        const existing = byId.get(detail.youtubeId)
        if (!existing) continue
        byId.set(detail.youtubeId, {
          ...existing,
          durationSec: detail.durationSec ?? existing.durationSec,
          isLive: detail.isLive || existing.isLive,
          publishedAt: existing.publishedAt ?? detail.publishedAt,
          embeddable: detail.embeddable ?? existing.embeddable ?? null,
        })
      }
      if (!via.includes('dataapi')) via.push('dataapi:duration')
    } catch (err) {
      warnings.push(`Data API lỗi khi bù thời lượng: ${msg(err)}`)
    }
  }

  const stillMissing = [...byId.values()].filter((v) => v.durationSec === null)
  if (stillMissing.length > 0 && (await ytdlpAvailable())) {
    try {
      // Gioi han 40 video/lan — yt-dlp phai tai mot trang cho moi video,
      // qua nhieu se lam cron treo hang phut.
      const batch = stillMissing.slice(0, 40).map((v) => v.youtubeId)
      for (const meta of await fetchVideoMeta(batch)) {
        const existing = byId.get(meta.youtubeId)
        if (!existing) continue
        byId.set(meta.youtubeId, {
          ...existing,
          durationSec: meta.durationSec ?? existing.durationSec,
          isLive: meta.isLive || existing.isLive,
        })
      }
      if (!via.includes('ytdlp')) via.push('ytdlp:duration')
    } catch (err) {
      warnings.push(`yt-dlp lỗi khi bù thời lượng: ${msg(err)}`)
    }
  }

  const unresolved = [...byId.values()].filter((v) => v.durationSec === null).length
  if (unresolved > 0) {
    warnings.push(
      `${unresolved} video chưa có thời lượng — bộ lọc theo độ dài sẽ bỏ qua các video này.`,
    )
  }

  return [...byId.values()]
}

interface UpsertResult {
  added: number
  updated: number
  autoRejected: number
}

/**
 * Ghi video vao DB.
 *
 * Nguyen tac P3: video MOI luon vao 'pending', tru khi bo me da bat
 * auto_approve cho nguon do mot cach co y thuc.
 * Video DA TON TAI khong bao gio bi doi status — neu bo me da duyet/loai roi
 * thi quyet dinh cua ho duoc giu nguyen.
 */
function upsertVideos(items: IngestedVideo[], source: SourceRow): UpsertResult {
  const db = getDb()
  const rules = activeRules()

  // channel_title can lay ve de tinh lai search_text: cau UPDATE duoi dung
  // COALESCE nen ten kenh CU van duoc giu khi lan nay khong lay duoc ten moi.
  const findExisting = db.prepare<[string], { id: number; status: string; channel_title: string | null }>(
    'SELECT id, status, channel_title FROM videos WHERE youtube_id = ?',
  )
  const insert = db.prepare(
    `INSERT INTO videos
       (youtube_id, title, thumbnail, duration_sec, channel_id, channel_title,
        published_at, source_id, status, reject_reason, is_live, embeddable,
        search_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  // Cap nhat metadata cho video da co, nhung KHONG dung den status.
  const update = db.prepare(
    `UPDATE videos SET
       title         = ?,
       thumbnail     = COALESCE(?, thumbnail),
       duration_sec  = COALESCE(?, duration_sec),
       channel_id    = COALESCE(?, channel_id),
       channel_title = COALESCE(?, channel_title),
       published_at  = COALESCE(published_at, ?),
       source_id     = COALESCE(source_id, ?),
       is_live       = ?,
       -- Giu gia tri da biet; chi ghi khi lan nay lay duoc thong tin moi.
       embeddable    = COALESCE(?, embeddable),
       search_text   = ?
     WHERE id = ?`,
  )

  let added = 0
  let updated = 0
  let autoRejected = 0

  const tx = db.transaction((videos: IngestedVideo[]) => {
    for (const v of videos) {
      const existing = findExisting.get(v.youtubeId)

      if (existing) {
        update.run(
          v.title,
          v.thumbnail,
          v.durationSec,
          v.channelId,
          v.channelTitle,
          v.publishedAt,
          source.id,
          v.isLive ? 1 : 0,
          v.embeddable === undefined || v.embeddable === null ? null : v.embeddable ? 1 : 0,
          buildSearchText(v.title, v.channelTitle ?? existing.channel_title),
          existing.id,
        )
        updated++
        continue
      }

      const verdict = evaluate(v, rules)
      let status: string
      let reason: string | null = null

      if (verdict.blocked) {
        status = 'rejected'
        reason = verdict.reason ?? 'Bộ lọc tự động'
        autoRejected++
      } else if (source.auto_approve === 1) {
        status = 'approved'
      } else {
        status = 'pending'
      }

      insert.run(
        v.youtubeId,
        v.title,
        v.thumbnail,
        v.durationSec,
        v.channelId,
        v.channelTitle,
        v.publishedAt,
        source.id,
        status,
        reason,
        v.isLive ? 1 : 0,
        v.embeddable === undefined || v.embeddable === null ? null : v.embeddable ? 1 : 0,
        buildSearchText(v.title, v.channelTitle),
      )
      added++
    }
  })

  tx(items)
  return { added, updated, autoRejected }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Keo tat ca nguon dang bat auto_pull. Dung cho cron. */
export async function ingestAllAutoSources(): Promise<IngestResult[]> {
  const sources = getDb()
    .prepare<[], SourceRow>(
      'SELECT * FROM sources WHERE is_active = 1 AND auto_pull = 1 ORDER BY id',
    )
    .all()

  const results: IngestResult[] = []
  for (const s of sources) {
    try {
      results.push(await ingestSource(s.id))
    } catch (err) {
      results.push({
        sourceId: s.id,
        added: 0,
        updated: 0,
        autoRejected: 0,
        fetched: 0,
        via: [],
        warnings: [`Lỗi: ${msg(err)}`],
      })
    }
  }
  return results
}
