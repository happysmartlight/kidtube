# ARCHITECTURE — KidTube Home

## Sơ đồ tổng thể

```
                    ┌─────────────── Raspberry Pi 5 ───────────────┐
  Tablet ──┐        │                                               │
           ├─ LAN ──┤  Caddy :443 (HTTPS nội bộ, reverse proxy)     │
  TV/Pi  ──┘        │         │                                     │
  (Chromium         │         ├──> Fastify :8080                    │
   kiosk)           │         │      ├─ /api/kid/*    (không auth)  │
                    │         │      ├─ /api/admin/*  (cookie PIN)  │
                    │         │      ├─ /media/*      (file đã tải) │
                    │         │      └─ /*            (SPA static)  │
                    │         │                                     │
                    │         │    ┌── SQLite (WAL) → data/kid.db   │
                    │         │    ├── cron: pull 6h, cleanup 1h    │
                    │         │    └── downloader: yt-dlp, conc=1   │
                    │         │              │                       │
                    │         └──────────────┴──> media/ (SSD)      │
                    └───────────────────────────────────────────────┘
                                        │
                                   Internet (chỉ backend gọi ra)
                                   RSS · HTML · yt-dlp · Data API
```

**Điểm then chốt:** giao diện của trẻ **không bao giờ** gọi trực tiếp ra YouTube API.
Nó chỉ đọc SQLite local qua `/api/kid/*` → mở là hiện ngay (nguyên tắc P7).
Chỉ có iframe player mới kết nối ra youtube-nocookie.com.

## Cây thư mục

```
apps/
  api/                        Backend Fastify
    src/
      index.ts                bootstrap, đăng ký plugin/route, serve SPA
      env.ts                  đọc & validate biến môi trường
      db/
        index.ts              mở SQLite, WAL, chạy migration, helper
        schema.sql            DDL đầy đủ (idempotent)
        seed.ts               dữ liệu mặc định lần đầu chạy
      services/
        youtube/resolve.ts    URL/handle → {type, id}  + scrape handle
        youtube/rss.ts        đọc Atom feed
        youtube/ytdlp.ts      wrapper yt-dlp (detect, metadata, download)
        youtube/dataapi.ts    Data API v3 (tuỳ chọn)
        ingest.ts             hợp nhất nguồn → ghi videos (pending)
        autofilter.ts         áp filter_rules
        timeLimit.ts          tính quota phía server
        downloader.ts         worker hàng đợi tải offline
        stats.ts              tổng hợp nhật ký xem
      routes/
        auth.ts  sources.ts  videos.ts  shelves.ts
        profiles.ts  settings.ts  filters.ts  downloads.ts
        stats.ts  kid.ts
      lib/
        errors.ts  http.ts  ids.ts  time.ts
      cron.ts                 lịch nền
  web/                        Frontend React
    src/
      main.tsx  App.tsx
      lib/      api.ts  mode.ts  sfx.ts  format.ts  store.ts
      nav/      spatial.tsx          spatial navigation cho D-pad
      ui/       Button Card Shelf Dialog Spinner Toast ...
      kid/      ProfilePick Home Favorites Channels Watch TimeUp
      player/   PlayerAdapter.ts YouTubePlayer.ts LocalPlayer.ts Controls.tsx
      admin/    Login Dashboard Sources Review Shelves Profiles
                Settings Filters Downloads Reports
docs/           REQUIREMENTS · PLAN · ARCHITECTURE · DESIGN
data/           kid.db (volume)
media/          video đã tải (volume)
```

## Mô hình dữ liệu

```
profiles ──┬─< profile_shelves >── shelves ──< shelf_items >── videos
           ├─< favorites >──────────────────────────────────────┤
           ├─< watch_log >──────────────────────────────────────┤
           └─< kid_sessions                                      │
                                              sources ──────────>┤
                                         download_queue ────────>┘
  settings (key-value)          filter_rules
```

Ràng buộc quan trọng:
- `videos.status` ∈ `pending | approved | rejected | later` — **trẻ chỉ thấy `approved`**
- Nhưng `approved` **chưa đủ**: video còn phải có mặt trong `shelf_items`
  của một kệ đang bật và được gán cho profile đó. Hai tầng cửa.
- `profile_shelves` rỗng cho một kệ = kệ đó hiện cho **mọi** bé.

## Vòng đời một video

```
   bố mẹ dán link
        │
        ▼
   resolve() ──> sources (channel/playlist/video)
        │
        ▼
   ingest() ──> RSS ─┬─> videos (status=pending)
                     ├─ yt-dlp fallback (bù duration, lịch sử cũ)
                     └─ Data API (nếu có key)
        │
        ▼
   autofilter() ──> có vi phạm? ──> status=rejected + reject_reason
        │ không
        ▼
   HÀNG CHỜ DUYỆT  ──bố mẹ bấm ❌──> rejected
        │ bấm ✅                     ──bấm 🔁──> later
        ▼
   status=approved ──> bố mẹ gán vào kệ (shelf_items)
        │
        ├─(tuỳ chọn)─> download_queue ──> yt-dlp ──> media/*.mp4
        ▼                                            local_path đã set
   TRẺ THẤY TRÊN TRANG CHỦ
        │
        ▼
   phát: local_path? ──có──> LocalPlayer (<video>)   ← sạch quảng cáo
                       └khôngg──> YouTubePlayer (iframe + overlay)
```

## Cron nền

| Việc | Tần suất | Ghi chú |
|---|---|---|
| Pull video mới | 6 giờ | chỉ source có `auto_pull=1`; ghi `status=pending` |
| Dọn session cũ | 1 giờ | xoá `kid_sessions` quá 24h |
| Dọn file orphan | 1 giờ | file trong `media/` không còn video tham chiếu |
| Ép giới hạn dung lượng | 1 giờ | vượt hạn → xoá video ít xem nhất trước |
| Tick downloader | 30 giây | lấy job tiếp theo nếu worker rảnh |

## Quyết định kỹ thuật & lý do

### SQLite thay vì Postgres
Dữ liệu cỡ vài nghìn dòng. Không cần container DB riêng → tiết kiệm RAM Pi.
Backup = copy một file. WAL mode cho phép đọc song song khi đang ghi.

### Tự viết spatial navigation, không dùng thư viện
Cần kiểm soát chính xác cách tìm láng giềng (theo hình học, không theo DOM order)
và tránh rủi ro thư viện không build được trên arm64. ~140 dòng.

Thuật toán: từ rect của element đang focus, lọc các `[data-focusable]` nằm về
phía cần đi, tính điểm `khoảng_cách_dọc_trục + 2 × lệch_vuông_góc`, chọn nhỏ nhất.
Nhân 2 vào lệch vuông góc để ưu tiên đi thẳng hơn đi chéo.

### Overlay chặn 100% pointer event
Không cố "chừa lỗ" cho vùng an toàn của iframe — YouTube có thể đổi layout bất kỳ lúc nào.
Chặn sạch, rồi tự viết toàn bộ thanh điều khiển qua JS API. Tap vào overlay =
bật/tắt thanh điều khiển. Đây là cách duy nhất đảm bảo nguyên tắc P4.

### Quota tính ở server
Client chỉ *hiển thị*. Mỗi 15s gửi heartbeat, server cộng dồn vào `kid_sessions`.
Reload trang không reset gì cả — session được nhận diện theo `profile_id` + cửa sổ thời gian.

### PlayerAdapter
Trẻ không được phân biệt stream và file local. Cùng một thanh điều khiển,
cùng phím tắt, cùng hành vi khi hết video. UI chỉ nói chuyện với interface,
không biết bên dưới là `<iframe>` hay `<video>`.

### Downloader concurrency = 1
Pi 5 ghi SSD qua USB3 và có thể phải remux. Chạy song song làm nghẽn I/O
và ảnh hưởng trải nghiệm xem đang diễn ra. Một job một lúc là đủ (~1–2 phút/video 720p).

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | 8080 | Cổng HTTP |
| `HOST` | 0.0.0.0 | Bind address |
| `DATA_DIR` | `./data` | Nơi chứa `kid.db` |
| `MEDIA_DIR` | `./media` | Nơi chứa video đã tải |
| `YT_API_KEY` | (rỗng) | YouTube Data API v3 — tuỳ chọn |
| `YTDLP_PATH` | `yt-dlp` | Đường dẫn binary |
| `SESSION_SECRET` | (tự sinh) | Ký cookie admin |
| `DEFAULT_PIN` | `246813` | PIN lần đầu, **đổi ngay sau khi cài** |
| `NODE_ENV` | development | |
