# PLAN — KidTube Home

> Lộ trình thực thi. Tick `[x]` khi xong. Đọc kèm [REQUIREMENTS.md](REQUIREMENTS.md).
> Nếu định làm gì không có trong plan này → cập nhật plan trước, rồi mới code.

Cập nhật: 2026-09-29

## Trạng thái tổng quan

| Phase | Nội dung | Trạng thái |
|---|---|---|
| 0 | Tài liệu & khung repo | ✅ Xong |
| 1 | Database & schema | ✅ Xong |
| 2 | Backend: nhập nguồn từ YouTube | ✅ Xong |
| 3 | Backend: API admin + kid | ✅ Xong |
| 4 | Backend: quota, cron, downloader | ✅ Xong |
| 5 | Frontend: nền tảng (nav, token, PWA) | ✅ Xong |
| 6 | Frontend: giao diện trẻ | ✅ Xong |
| 7 | Frontend: player + overlay bảo vệ | ✅ Xong |
| 8 | Frontend: trang quản trị | ✅ Xong |
| 9 | Docker & triển khai Pi 5 | ✅ Xong |
| 10 | Nâng cao (Telegram, sticker, báo cáo) | ⬜ Chưa (v0.3+) |

---

## Phase 0 — Tài liệu & khung repo
- [x] `docs/REQUIREMENTS.md` — yêu cầu gốc, nguyên tắc P1–P7
- [x] `docs/PLAN.md` — file này
- [x] `docs/ARCHITECTURE.md` — kiến trúc, sơ đồ, quyết định kỹ thuật
- [x] `docs/DESIGN.md` — design token, spec UI, quy tắc TV
- [x] npm workspaces: `apps/api`, `apps/web`
- [x] `.gitignore`, `.env.example`, `README.md`

## Phase 1 — Database
- [x] `schema.sql`: profiles, sources, videos, shelves, shelf_items,
      profile_shelves, favorites, watch_log, kid_sessions, download_queue,
      filter_rules, settings
- [x] Migration runner tự động (idempotent, chạy lúc boot)
- [x] Seed mặc định: 1 profile "Bé", 4 kệ mẫu, settings mặc định, PIN mặc định
- [x] WAL mode + index cho các truy vấn nóng

## Phase 2 — Nhập nguồn từ YouTube
- [x] `resolve.ts` — parse mọi dạng URL → `{type, id}`
      (watch, youtu.be, shorts, /channel/, /@handle, /c/, /user/, playlist, live)
- [x] Resolve `@handle` → channelId bằng HTML scrape (`externalId` → canonical → channelId)
- [x] `rss.ts` — đọc feed `videos.xml?channel_id=` / `?playlist_id=` (15 video mới nhất)
- [x] `ytdlp.ts` — phát hiện binary lúc runtime; lấy metadata đầy đủ + duration
- [x] `dataapi.ts` — YouTube Data API v3 (tuỳ chọn, chỉ khi có key)
- [x] `ingest.ts` — hợp nhất 3 nguồn, ghi vào `videos` với `status='pending'`
- [x] `autofilter.ts` — áp filter_rules, tự set `status='rejected'` + lý do

## Phase 3 — API
- [x] Parent gate: PIN → cookie session, `requireParent` hook
- [x] Admin: sources (CRUD + preview + pull thủ công)
- [x] Admin: videos (list theo status, duyệt lẻ, duyệt hàng loạt)
- [x] Admin: shelves (CRUD + reorder kệ + reorder item + gán profile)
- [x] Admin: profiles (CRUD + cấu hình quota riêng từng bé)
- [x] Admin: settings, filters, stats (báo cáo nhật ký xem)
- [x] Admin: downloads (enqueue, huỷ, xem tiến độ, dọn rác)
- [x] Kid: profiles, home, favorites, channels, video, quota
- [x] Kid: watch start / heartbeat / end

## Phase 4 — Quota, cron, downloader
- [x] `timeLimit.ts` — tính quota **phía server** (P5): daily, session,
      số video/lượt, khung giờ cho phép → `{allowed, reason, remaining...}`
- [x] Heartbeat 15s cộng dồn `seconds_used`, chống gian lận reload
- [x] Cron kéo video mới mỗi 6h cho source có `auto_pull=1`
- [x] Cron dọn `kid_sessions` cũ, dọn file orphan
- [x] `downloader.ts` — hàng đợi SQLite, concurrency 1, parse `--newline`,
      cap 720p, giới hạn dung lượng tổng

## Phase 5 — Frontend nền tảng
- [x] Vite + React + TS + Tailwind v4, alias `@/`
- [x] `spatial.tsx` — spatial navigation tự viết (tìm láng giềng theo hình học)
- [x] `mode.ts` — tự nhận diện touch/tv + override, gắn `data-mode` lên root
- [x] Design token 2 bộ theo mode (xem DESIGN.md)
- [x] PWA: manifest, icon, service worker (cache shell)
- [x] `sfx.ts` — âm thanh phản hồi bằng WebAudio (không cần file mp3)

## Phase 6 — Giao diện trẻ
- [x] Trang chọn profile (avatar con vật)
- [x] Trang chủ: kệ ngang cuộn, card thumbnail lớn
- [x] Trang Yêu thích
- [x] Trang Kênh (nhóm theo source)
- [x] Thanh điều hướng dưới 3 nút to
- [x] Màn hình hết giờ + đếm ngược thân thiện (còn 5 phút)
- [x] Nút ⚙ long-press 3s → parent gate

## Phase 7 — Player
- [x] `PlayerAdapter` interface
- [x] `YouTubePlayer` — IFrame API + overlay chặn 100% pointer event
- [x] `LocalPlayer` — `<video>` cho file đã tải
- [x] Thanh điều khiển tự viết dùng chung cho cả hai
- [x] ENDED → destroy ngay, không để endscreen hiện
- [x] Autoplay tuỳ chọn, giới hạn N video liên tiếp
- [x] Heartbeat khi đang phát

## Phase 8 — Trang quản trị
- [x] Đăng nhập PIN
- [x] Dashboard: số video chờ duyệt, thời gian xem hôm nay, dung lượng đã tải
- [x] Nguồn: thêm bằng dán link + preview, bật/tắt auto_pull, pull ngay
- [x] Hàng chờ duyệt: grid, duyệt lẻ / hàng loạt / chọn tất cả
- [x] Kệ: kéo-thả kệ và item, gán profile
- [x] Bé: CRUD + quota riêng
- [x] Cài đặt: autoplay, offline mode, PIN, mode override, API key
- [x] Bộ lọc tự động
- [x] Tải offline: hàng đợi + tiến độ
- [x] Báo cáo: nhật ký xem theo ngày/bé

## Phase 9 — Triển khai
- [x] `Dockerfile` multi-stage, arm64, có yt-dlp + ffmpeg
- [x] `docker-compose.yml` + volume cho `data/` và `media/`
- [x] Healthcheck
- [x] README: hướng dẫn cài trên Pi 5, Chromium kiosk, PWA trên tablet

## Phát sinh thêm (không có trong plan ban đầu, đã làm)

Phát hiện khi test thật, đã xử lý:

- [x] **Migration runner** (`db/index.ts`): `schema.sql` dùng `CREATE TABLE IF NOT
      EXISTS` nên cột mới không xuất hiện trên DB đã tạo trước → tự `ALTER TABLE`
      cho cột thiếu. Thêm cột mới chỉ cần thêm một dòng vào `COLUMN_MIGRATIONS`.
- [x] **Xử lý kênh chặn nhúng** (`embeddable`): nhiều kênh trẻ em lớn (Cocomelon…)
      không cho nhúng video ra ngoài YouTube. Player bắt mã lỗi 101/150 → báo về
      server → video bị **ẩn khỏi giao diện của con** (khỏi bấm vào rồi gặp lỗi)
      → admin hiện cảnh báo + nút một bấm "Tải offline" để khắc phục.
      Có `YT_API_KEY` thì biết trước qua `status.embeddable`.
- [x] **Chuẩn hoá `channelId` từ RSS**: YouTube trả `<yt:channelId>` ở cấp feed
      **thiếu tiền tố `UC`** (quirk thật, đã verify). Không chuẩn hoá thì gán sai
      channelId cho video.
- [x] **Parser JSON chấp nhận body rỗng**: nhiều endpoint POST không cần body;
      parser mặc định của Fastify trả 400 → làm `logout` thất bại nên **phiên
      admin không được xoá**. Phát hiện trong smoke test.
- [x] **Sửa vòng lặp request vô hạn**: callback truyền inline xuống `Home` đổi
      identity mỗi render → `useEffect` chạy lại → gọi `/api/kid/home` liên tục.
      Sửa cả hai đầu: `useCallback` ở `App` + ref ở `Home`.
- [x] **Tương thích LG webOS**: bỏ toàn bộ `color-mix()` (cần Chromium 111, TV LG
      mới nhất mới ~108), thêm fallback `:focus` / `aspect-ratio` / `gap`,
      build target `es2019`, `safeScrollIntoView`, thử `requestFullscreen`.
- [x] **Nâng `@fastify/static` lên 10.x**: bản 8.x có lỗ hổng path traversal —
      liên quan trực tiếp vì dùng để serve `/media`.

## Phase 10 — Nâng cao (chưa làm)
- [ ] Bot Telegram: báo cáo tối + thông báo video chờ duyệt
- [ ] Hệ thống sticker thưởng ("xem hết 3 video được 1 sticker")
- [ ] Tìm kiếm bằng hình (bấm emoji thay vì gõ chữ)
- [ ] Tự nhận diện mode qua Chromium kiosk user-agent
- [ ] Backup tự động file SQLite ra NAS
- [ ] Chế độ "xem cùng bố mẹ" — tạm mở giới hạn 1 lần

---

## Đã kiểm chứng bằng gì

- **API**: smoke test 32 bước với kênh YouTube thật (thêm nguồn qua `@handle`,
  duyệt, hai tầng cửa, quota chặn/cho, heartbeat kẹp trần chống gian lận,
  path traversal vào `/media`, đổi PIN, logout).
- **Giao diện**: Playwright + Edge thật — chọn bé, trang chủ, 8 tab admin,
  parent gate (bấm 0.4s KHÔNG mở / giữ 3.3s mở), PIN sai/đúng,
  D-pad đi qua các card rồi xuống nav (không bẫy focus), focus ring 4px hiện rõ,
  token `touch` vs `tv` đổi đúng, luồng chặn nhúng tự chữa (home 8 → 7 video).
- **Build**: kiểm tra CSS/JS đã build **không còn `color-mix()` ngoài `@supports`**
  và không còn `?.` / `??` chưa dịch.
- **Chưa kiểm chứng**: build Docker trên arm64 thật (máy dev là Windows/amd64),
  chế độ tải offline end-to-end (máy dev không có `yt-dlp`/`ffmpeg`),
  và hiển thị thật trên TV LG.

## Nợ kỹ thuật đã biết
- RSS chỉ trả 15 video mới nhất → lần đầu thêm kênh, muốn lấy toàn bộ lịch sử
  cần `yt-dlp` hoặc Data API. Đã có fallback, nhưng nếu thiếu cả hai thì
  chỉ nhập được 15 video/kênh.
- RSS **không có duration** → `duration_sec = NULL` cho tới khi yt-dlp/Data API
  điền vào. UI hiện `—` thay vì thời lượng. Filter theo độ dài bỏ qua video này.
- `yt-dlp` cần update định kỳ theo thay đổi của YouTube → Dockerfile pin phiên bản,
  cần rebuild image khi hỏng.
- Nhúng iframe **vẫn có quảng cáo**. Chỉ chế độ offline mới sạch hoàn toàn.
- **Kênh chặn nhúng**: không có `YT_API_KEY` thì chỉ biết được SAU khi trẻ bấm
  vào một lần (player báo lỗi rồi mới ghi nhận). Lần đầu đó trẻ vẫn thấy màn hình
  🙈. Có API key thì biết ngay khi kéo về.
- **Trên TV LG không cài được PWA** → trẻ vẫn bấm Home/Back ra khỏi app được.
  Không khắc phục được bằng code; bù bằng khoá ứng dụng của TV.
- Phiên đăng nhập của bố mẹ lưu **trong bộ nhớ** → restart server là phải nhập
  PIN lại. Cố ý (nghiêng về an toàn), nhưng có `SESSION_SECRET` thì cookie vẫn
  hợp lệ về mặt chữ ký — chỉ mất danh sách phiên.
