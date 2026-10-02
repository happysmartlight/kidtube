import type { FastifyInstance } from 'fastify'
import { getDb, getSettingBool, getSettingInt, getSetting } from '../db/index.js'
import type { ProfileRow, ShelfRow, VideoRow } from '../db/types.js'
import { badRequest, notFound } from '../lib/errors.js'
import { localDay, sqlNow } from '../lib/time.js'
import {
  addWatchTime,
  closeSession,
  computeQuota,
  countVideo,
  getProfile,
  touchSession,
} from '../services/timeLimit.js'

/**
 * HAI TANG CUA (nguyen tac P1):
 *   1. video.status = 'approved'  — bo me da duyet tung cai
 *   2. video nam trong mot ke DANG BAT va ke do duoc gan cho be nay
 *
 * Ke khong co dong nao trong profile_shelves = hien cho MOI be.
 *
 * Moi truy van tra ve video cho tre PHAI dung dieu kien nay. Dac biet la
 * endpoint phat video: neu thieu, chi can doi id trong URL la xem duoc
 * bat cu video nao trong DB.
 *
 * Dieu kien `embeddable`: nhieu kenh tre em lon (Cocomelon...) CHAN nhung
 * video ra ngoai YouTube. Neu van hien cho tre thi be bam vao se gap man hinh
 * loi — nen an di, TRU KHI da co ban tai ve (file local thi khong can nhung).
 * Bo me thay canh bao ro rang trong trang quan tri (tab Hang cho duyet).
 */
const VISIBLE = `
  v.status = 'approved'
  AND (v.embeddable IS NULL OR v.embeddable = 1 OR v.local_path IS NOT NULL)
  AND EXISTS (
    SELECT 1
      FROM shelf_items si
      JOIN shelves sh ON sh.id = si.shelf_id AND sh.is_active = 1
     WHERE si.video_id = v.id
       AND (
         NOT EXISTS (SELECT 1 FROM profile_shelves ps WHERE ps.shelf_id = sh.id)
         OR EXISTS (SELECT 1 FROM profile_shelves ps
                     WHERE ps.shelf_id = sh.id AND ps.profile_id = @pid)
       )
  )`

/** Truong duoc phep gui cho client cua tre — khong lo lot du lieu quan tri. */
interface KidVideo {
  id: number
  youtubeId: string
  title: string
  thumbnail: string | null
  durationSec: number | null
  channelTitle: string | null
  hasLocal: boolean
  isFavorite: boolean
}

const KID_VIDEO_COLUMNS = `
  v.id            AS id,
  v.youtube_id    AS youtubeId,
  v.title         AS title,
  v.thumbnail     AS thumbnail,
  v.duration_sec  AS durationSec,
  v.channel_title AS channelTitle,
  (v.local_path IS NOT NULL) AS hasLocalRaw,
  EXISTS (SELECT 1 FROM favorites f WHERE f.video_id = v.id AND f.profile_id = @pid) AS isFavoriteRaw`

interface RawKidVideo {
  id: number
  youtubeId: string
  title: string
  thumbnail: string | null
  durationSec: number | null
  channelTitle: string | null
  hasLocalRaw: number
  isFavoriteRaw: number
}

function toKidVideo(r: RawKidVideo): KidVideo {
  return {
    id: r.id,
    youtubeId: r.youtubeId,
    title: r.title,
    thumbnail: r.thumbnail,
    durationSec: r.durationSec,
    channelTitle: r.channelTitle,
    hasLocal: r.hasLocalRaw === 1,
    isFavorite: r.isFavoriteRaw === 1,
  }
}

function requireProfileId(raw: unknown): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) throw badRequest('Thiếu tham số profileId')
  getProfile(id) // nem 404 neu khong co
  return id
}

export async function kidRoutes(app: FastifyInstance): Promise<void> {
  /** Cau hinh giao dien — client can truoc khi chon be. */
  app.get('/api/kid/config', async () => ({
    uiModeOverride: getSetting('ui_mode_override') ?? 'auto',
    sfxEnabled: getSettingBool('sfx_enabled', true),
    showDuration: getSettingBool('show_duration', true),
    showDownloadBadge: getSettingBool('show_download_badge', true),
    warnBeforeMin: getSettingInt('warn_before_min', 5),
  }))

  app.get('/api/kid/profiles', async () => {
    const rows = getDb()
      .prepare<[], Pick<ProfileRow, 'id' | 'name' | 'avatar' | 'color'>>(
        'SELECT id, name, avatar, color FROM profiles WHERE is_active = 1 ORDER BY position, id',
      )
      .all()
    return { profiles: rows }
  })

  app.get<{ Querystring: { profileId?: string } }>('/api/kid/quota', async (req) => {
    const pid = requireProfileId(req.query.profileId)
    return { quota: computeQuota(pid) }
  })

  /**
   * Danh sach ke, KHONG kem video.
   *
   * Trang chu dung cai nay cho hang nut chon chu de o tren: tre thay ngay
   * co nhung ke nao ma khong phai cuon het ke thu nhat. Rat nhe (chi mot
   * cau COUNT moi ke) nen hien duoc tuc thi, roi video cua ke dang chon
   * lay rieng qua /api/kid/shelf/:id.
   */
  app.get<{ Querystring: { profileId?: string } }>('/api/kid/shelves', async (req) => {
    const pid = requireProfileId(req.query.profileId)
    const db = getDb()

    touchSession(pid)

    const rows = db
      .prepare<{ pid: number }, { id: number; title: string; emoji: string; color: string; total: number }>(
        `SELECT sh.id    AS id,
                sh.title AS title,
                sh.emoji AS emoji,
                sh.color AS color,
                (SELECT COUNT(*)
                   FROM shelf_items si
                   JOIN videos v ON v.id = si.video_id
                  WHERE si.shelf_id = sh.id
                    AND v.status = 'approved'
                    AND (v.embeddable IS NULL OR v.embeddable = 1 OR v.local_path IS NOT NULL)
                ) AS total
           FROM shelves sh
          WHERE sh.is_active = 1
            AND (
              NOT EXISTS (SELECT 1 FROM profile_shelves ps WHERE ps.shelf_id = sh.id)
              OR EXISTS (SELECT 1 FROM profile_shelves ps
                          WHERE ps.shelf_id = sh.id AND ps.profile_id = @pid)
            )
          ORDER BY sh.position, sh.id`,
      )
      .all({ pid })

    // Ke rong thi khong hien — tre bam vao roi thay trang se thay la.
    return { shelves: rows.filter((s) => s.total > 0), quota: computeQuota(pid) }
  })

  app.get<{ Querystring: { profileId?: string } }>('/api/kid/favorites', async (req) => {
    const pid = requireProfileId(req.query.profileId)
    const rows = getDb()
      .prepare<{ pid: number }, RawKidVideo>(
        `SELECT ${KID_VIDEO_COLUMNS}
           FROM favorites f
           JOIN videos v ON v.id = f.video_id
          WHERE f.profile_id = @pid
            AND ${VISIBLE}
          ORDER BY f.created_at DESC`,
      )
      .all({ pid })
    return { videos: rows.map(toKidVideo) }
  })

  /**
   * Trang "Kênh": danh sach nguon, KHONG kem video.
   *
   * Doi xung voi /api/kid/shelves — client chi can ten + so luong de dung
   * hang nut chon kenh, video cua kenh dang chon lay rieng qua
   * /api/kid/discover?sourceId=. Keo san video cua MOI kenh la lang phi lon
   * khi co nhieu kenh.
   */
  app.get<{ Querystring: { profileId?: string } }>('/api/kid/channels', async (req) => {
    const pid = requireProfileId(req.query.profileId)
    const db = getDb()

    touchSession(pid)

    const groups = db
      .prepare<{ pid: number }, { id: number; title: string; thumbnail: string | null; n: number }>(
        `SELECT s.id        AS id,
                s.title     AS title,
                s.thumbnail AS thumbnail,
                COUNT(*)    AS n
           FROM sources s
           JOIN videos v ON v.source_id = s.id
          WHERE s.is_active = 1
            AND ${VISIBLE}
          GROUP BY s.id
          ORDER BY s.title COLLATE NOCASE`,
      )
      .all({ pid })

    // Tong cho nut "Tất cả" cua tab Kham pha. Dem RIENG, khong cong cac kenh
    // lai: /api/kid/discover khong loc theo nguon nen con tinh ca video cua
    // nguon da tat hoac da bi xoa (source_id = NULL) — cong cac kenh se thieu.
    // Cung dieu kien VISIBLE nen luon bang `total` cua discover khi khong loc.
    const total =
      db
        .prepare<{ pid: number }, { n: number }>(
          `SELECT COUNT(*) AS n FROM videos v WHERE ${VISIBLE}`,
        )
        .get({ pid })?.n ?? 0

    return {
      channels: groups.map((g) => ({
        id: g.id,
        title: g.title,
        thumbnail: g.thumbnail,
        total: g.n,
      })),
      total,
      quota: computeQuota(pid),
    }
  })

  /**
   * "Xem tat ca" cua mot ke — tra ve theo trang.
   *
   * Vi sao can: mot ke co the co hang nghin video. Nhoi het vao hang cuon
   * ngang o trang chu thi tre phai bam phai hang nghin lan moi tham duoc
   * cai cuoi — coi nhu an luon. Trang nay hien dang LUOI, cuon doc, co
   * "Tai them".
   *
   * Van phai di qua HAI TANG CUA nhu moi endpoint khac: ke phai dang bat va
   * duoc gan cho be nay, video phai `approved`.
   */
  app.get<{ Params: { id: string }; Querystring: { profileId?: string; offset?: string; limit?: string } }>(
    '/api/kid/shelf/:id',
    async (req) => {
      const pid = requireProfileId(req.query.profileId)
      const shelfId = Number(req.params.id)
      const limit = Math.min(Math.max(Number(req.query.limit ?? 60) || 60, 1), 200)
      const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0)
      const db = getDb()

      const shelf = db
        .prepare<{ pid: number; id: number }, ShelfRow>(
          `SELECT sh.*
             FROM shelves sh
            WHERE sh.id = @id
              AND sh.is_active = 1
              AND (
                NOT EXISTS (SELECT 1 FROM profile_shelves ps WHERE ps.shelf_id = sh.id)
                OR EXISTS (SELECT 1 FROM profile_shelves ps
                            WHERE ps.shelf_id = sh.id AND ps.profile_id = @pid)
              )`,
        )
        .get({ pid, id: shelfId })
      if (!shelf) throw notFound('Kệ này không xem được')

      touchSession(pid)

      const videos = db
        .prepare<{ pid: number; shelfId: number; lim: number; off: number }, RawKidVideo>(
          `SELECT ${KID_VIDEO_COLUMNS}
             FROM shelf_items si
             JOIN videos v ON v.id = si.video_id
            WHERE si.shelf_id = @shelfId
              AND v.status = 'approved'
              AND (v.embeddable IS NULL OR v.embeddable = 1 OR v.local_path IS NOT NULL)
            ORDER BY si.position, si.id
            LIMIT @lim OFFSET @off`,
        )
        .all({ pid, shelfId, lim: limit, off: offset })
        .map(toKidVideo)

      const total =
        db
          .prepare<{ shelfId: number }, { n: number }>(
            `SELECT COUNT(*) AS n
               FROM shelf_items si
               JOIN videos v ON v.id = si.video_id
              WHERE si.shelf_id = @shelfId
                AND v.status = 'approved'
                AND (v.embeddable IS NULL OR v.embeddable = 1 OR v.local_path IS NOT NULL)`,
          )
          .get({ shelfId })?.n ?? 0

      return {
        shelf: { id: shelf.id, title: shelf.title, emoji: shelf.emoji, color: shelf.color },
        videos,
        total,
        offset,
        hasMore: offset + videos.length < total,
        quota: computeQuota(pid),
      }
    },
  )

  /**
   * Kham pha: video DA DUYET, tron ngau nhien.
   *
   * Khac voi trang chu (theo ke, thu tu bo me xep), cho nay de tre gap lai
   * nhung video cu da bi day xuong duoi trong ke. Loc theo `sourceId` thi
   * chi tron trong mot kenh.
   *
   * `seed` quyet dinh thu tu. Cung seed -> cung thu tu, nen "Xem them" lay
   * dung phan tiep theo chu khong lap lai video da hien. Doi seed = "Lam moi".
   * Xem ghi chu cua seeded_rand trong db/index.ts.
   */
  app.get<{
    Querystring: {
      profileId?: string
      sourceId?: string
      seed?: string
      offset?: string
      limit?: string
    }
  }>('/api/kid/discover', async (req) => {
    const pid = requireProfileId(req.query.profileId)
    const limit = Math.min(Math.max(Number(req.query.limit ?? 60) || 60, 1), 200)
    const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0)
    // Kep seed trong 32 bit de phep nhan trong seeded_rand khong tran.
    const seed = (Number(req.query.seed) || 0) >>> 0
    const db = getDb()

    touchSession(pid)

    // sourceId = 0 hoac thieu -> tron toan bo, khong loc kenh.
    const sid = Number(req.query.sourceId)
    const bySource = Number.isFinite(sid) && sid > 0
    if (bySource) {
      const source = db
        .prepare<[number], { id: number }>('SELECT id FROM sources WHERE id = ? AND is_active = 1')
        .get(sid)
      if (!source) throw notFound('Kênh này không xem được')
    }
    const sourceFilter = bySource ? 'AND v.source_id = @sid' : ''

    const videos = db
      .prepare<
        { pid: number; sid: number; seed: number; lim: number; off: number },
        RawKidVideo
      >(
        `SELECT ${KID_VIDEO_COLUMNS}
           FROM videos v
          WHERE ${VISIBLE}
            ${sourceFilter}
          ORDER BY seeded_rand(v.id, @seed), v.id
          LIMIT @lim OFFSET @off`,
      )
      .all({ pid, sid: bySource ? sid : 0, seed, lim: limit, off: offset })
      .map(toKidVideo)

    const total =
      db
        .prepare<{ pid: number; sid: number }, { n: number }>(
          `SELECT COUNT(*) AS n FROM videos v WHERE ${VISIBLE} ${sourceFilter}`,
        )
        .get({ pid, sid: bySource ? sid : 0 })?.n ?? 0

    return {
      videos,
      total,
      offset,
      hasMore: offset + videos.length < total,
      quota: computeQuota(pid),
    }
  })


  /**
   * Thong tin de phat mot video.
   * Day la diem CHAN quan trong nhat: kiem tra hai tang cua truoc khi tra ve gi ca.
   */
  app.get<{ Params: { id: string }; Querystring: { profileId?: string } }>(
    '/api/kid/video/:id',
    async (req) => {
      const pid = requireProfileId(req.query.profileId)
      const id = Number(req.params.id)
      const db = getDb()

      const row = db
        .prepare<{ pid: number; id: number }, RawKidVideo>(
          `SELECT ${KID_VIDEO_COLUMNS}
             FROM videos v
            WHERE v.id = @id AND ${VISIBLE}`,
        )
        .get({ pid, id })

      // Co y KHONG phan biet "khong ton tai" va "khong duoc phep" —
      // khong tiet lo gi ve noi dung nam ngoai whitelist.
      if (!row) throw notFound('Video này không xem được')

      const quota = computeQuota(pid)
      if (!quota.allowed) {
        return { blocked: true, quota, video: null, next: null }
      }

      const full = db
        .prepare<[number], VideoRow>('SELECT local_path FROM videos WHERE id = ?')
        .get(id)
      const profile = getProfile(pid)

      /**
       * Video tiep theo trong cung ke — dung cho autoplay va nut "tiep".
       *
       * `cur` = MOT dong shelf_items cua video dang xem, chi lay trong ke ma
       * BE NAY duoc xem (dang bat + khong gan rieng hoac gan cho be nay).
       *
       * Ban cu chon ke bang `LIMIT 1` khong kiem tra gan cho be nao, nen khi
       * mot video nam ca trong ke chung lan ke rieng cua be khac, "tiep theo"
       * co the la video trong ke rieng do — lo tieu de + thumbnail ra ngoai
       * whitelist, va bam vao thi be gap man hinh loi. Ban cu con lay `position`
       * tu mot dong khac voi dong da chon ke, nen co the nhay coc video.
       *
       * Video tiep theo nam trong cung ke `cur` (ke be duoc xem) nen tu dong
       * thoa tang cua thu hai; tang thu nhat (approved + nhung duoc) kiem lai
       * ngay ben duoi. Thu tu (position, id) khop voi luoi o trang chu.
       */
      const next = db
        .prepare<{ pid: number; id: number }, RawKidVideo>(
          `WITH cur AS (
             SELECT si.shelf_id AS shelf_id, si.position AS position, si.id AS item_id
               FROM shelf_items si
               JOIN shelves sh ON sh.id = si.shelf_id AND sh.is_active = 1
              WHERE si.video_id = @id
                AND (
                  NOT EXISTS (SELECT 1 FROM profile_shelves ps WHERE ps.shelf_id = sh.id)
                  OR EXISTS (SELECT 1 FROM profile_shelves ps
                              WHERE ps.shelf_id = sh.id AND ps.profile_id = @pid)
                )
              ORDER BY sh.position, sh.id
              LIMIT 1
           )
           SELECT ${KID_VIDEO_COLUMNS}
             FROM cur
             JOIN shelf_items si ON si.shelf_id = cur.shelf_id
             JOIN videos v ON v.id = si.video_id
            WHERE (si.position > cur.position
                   OR (si.position = cur.position AND si.id > cur.item_id))
              AND v.status = 'approved'
              AND (v.embeddable IS NULL OR v.embeddable = 1 OR v.local_path IS NOT NULL)
            ORDER BY si.position, si.id
            LIMIT 1`,
        )
        .get({ pid, id })

      return {
        blocked: false,
        quota,
        video: {
          ...toKidVideo(row),
          // Duong dan da encode — ten file la youtube_id nen an toan,
          // nhung encode de chac chan.
          localUrl: full?.local_path ? `/media/${encodeURIComponent(full.local_path)}` : null,
        },
        next: next ? toKidVideo(next) : null,
        autoplay: profile.autoplay === 1,
        autoplayMax: profile.autoplay_max,
      }
    },
  )

  // ── Theo doi luot xem ────────────────────────────────────────────────

  app.post<{ Body: { profileId?: number; videoId?: number } }>(
    '/api/kid/watch/start',
    async (req) => {
      const pid = requireProfileId(req.body?.profileId)
      const videoId = Number(req.body?.videoId)
      const db = getDb()

      // Kiem tra lai quyen xem — khong tin body cua client.
      const allowed = db
        .prepare<{ pid: number; id: number }, { id: number }>(
          `SELECT v.id FROM videos v WHERE v.id = @id AND ${VISIBLE}`,
        )
        .get({ pid, id: videoId })
      if (!allowed) throw notFound('Video này không xem được')

      const quota = computeQuota(pid)
      if (!quota.allowed) return { logId: null, quota }

      const info = db
        .prepare('INSERT INTO watch_log (profile_id, video_id, day, started_at) VALUES (?, ?, ?, ?)')
        .run(pid, videoId, localDay(), sqlNow())

      db.prepare(
        'UPDATE videos SET watch_count = watch_count + 1, last_watched_at = ? WHERE id = ?',
      ).run(sqlNow(), videoId)

      return { logId: Number(info.lastInsertRowid), quota }
    },
  )

  /**
   * Heartbeat moi ~15 giay khi dang phat.
   * Server cong don; `seconds` bi kep tran trong timeLimit.addWatchTime.
   */
  app.post<{ Body: { profileId?: number; logId?: number; seconds?: number } }>(
    '/api/kid/watch/heartbeat',
    async (req) => {
      const pid = requireProfileId(req.body?.profileId)
      const seconds = Number(req.body?.seconds ?? 15)
      const logId = Number(req.body?.logId)

      const quota = addWatchTime(pid, Number.isFinite(seconds) ? seconds : 15)

      if (Number.isFinite(logId) && logId > 0) {
        getDb()
          .prepare(
            'UPDATE watch_log SET seconds_watched = seconds_watched + ? WHERE id = ? AND profile_id = ?',
          )
          .run(Math.max(0, Math.min(Math.round(seconds), 90)), logId, pid)
      }

      return { quota }
    },
  )

  app.post<{ Body: { profileId?: number; logId?: number; completed?: boolean } }>(
    '/api/kid/watch/end',
    async (req) => {
      const pid = requireProfileId(req.body?.profileId)
      const logId = Number(req.body?.logId)
      const completed = req.body?.completed === true

      if (Number.isFinite(logId) && logId > 0) {
        getDb()
          .prepare(
            'UPDATE watch_log SET ended_at = ?, completed = ? WHERE id = ? AND profile_id = ?',
          )
          .run(sqlNow(), completed ? 1 : 0, logId, pid)
      }

      // Chi tinh vao gioi han "so video/luot" khi da xem het.
      if (completed) countVideo(pid)

      return { quota: computeQuota(pid) }
    },
  )

  app.post<{ Body: { profileId?: number; videoId?: number } }>(
    '/api/kid/favorite',
    async (req) => {
      const pid = requireProfileId(req.body?.profileId)
      const videoId = Number(req.body?.videoId)
      const db = getDb()

      const allowed = db
        .prepare<{ pid: number; id: number }, { id: number }>(
          `SELECT v.id FROM videos v WHERE v.id = @id AND ${VISIBLE}`,
        )
        .get({ pid, id: videoId })
      if (!allowed) throw notFound('Video này không xem được')

      const existing = db
        .prepare<[number, number], { profile_id: number }>(
          'SELECT profile_id FROM favorites WHERE profile_id = ? AND video_id = ?',
        )
        .get(pid, videoId)

      if (existing) {
        db.prepare('DELETE FROM favorites WHERE profile_id = ? AND video_id = ?').run(pid, videoId)
        return { isFavorite: false }
      }

      db.prepare('INSERT INTO favorites (profile_id, video_id) VALUES (?, ?)').run(pid, videoId)
      return { isFavorite: true }
    },
  )

  /**
   * Player bao lai rang YouTube tu choi nhung video nay (ma loi 101/150).
   *
   * Day la cach duy nhat biet duoc dieu do khi khong co YT_API_KEY: phai thu
   * mo iframe that moi biet. Ghi lai de:
   *   - lan sau KHONG hien video do cho tre (khoi bam vao roi gap loi)
   *   - bo me thay canh bao trong trang quan tri va tai ban offline thay the
   *
   * Khong can auth (tre goi), nhung chi ghi duoc cho video ma be nay
   * that su duoc phep xem — khong cho ghi bua vao video khac.
   */
  app.post<{ Params: { id: string }; Body: { profileId?: number } }>(
    '/api/kid/video/:id/embed-blocked',
    async (req) => {
      const pid = requireProfileId(req.body?.profileId)
      const id = Number(req.params.id)
      const db = getDb()

      const allowed = db
        .prepare<{ pid: number; id: number }, { id: number }>(
          `SELECT v.id FROM videos v
            WHERE v.id = @id
              AND v.status = 'approved'
              AND EXISTS (
                SELECT 1 FROM shelf_items si
                  JOIN shelves sh ON sh.id = si.shelf_id AND sh.is_active = 1
                 WHERE si.video_id = v.id
                   AND (
                     NOT EXISTS (SELECT 1 FROM profile_shelves ps WHERE ps.shelf_id = sh.id)
                     OR EXISTS (SELECT 1 FROM profile_shelves ps
                                 WHERE ps.shelf_id = sh.id AND ps.profile_id = @pid)
                   )
              )`,
        )
        .get({ pid, id })
      if (!allowed) throw notFound('Video này không xem được')

      db.prepare('UPDATE videos SET embeddable = 0 WHERE id = ?').run(id)
      return { ok: true }
    },
  )

  /** Tre thoat ve man hinh chon be -> dong phien. */
  app.post<{ Body: { profileId?: number } }>('/api/kid/session/close', async (req) => {
    const pid = requireProfileId(req.body?.profileId)
    closeSession(pid)
    return { ok: true }
  })
}
