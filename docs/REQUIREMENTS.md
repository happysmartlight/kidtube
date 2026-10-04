# YÊU CẦU GỐC — KidTube Home

> File này ghi lại **yêu cầu ban đầu và mọi quyết định đã chốt**.
> Khi nghi ngờ "hồi đó mình muốn gì", đọc file này trước.
> Chỉ sửa file này khi yêu cầu thực sự thay đổi — kèm ghi ngày.

Ngày lập: 2026-09-29

---

## 1. Bối cảnh & mục tiêu

Chủ sở hữu có **homelab chạy Raspberry Pi 5**. Cần một **web app self-hosted**
cho con nhỏ xem YouTube, với:

- Giao diện và bố cục nút bấm **tương tự YouTube Kids**.
- Bố mẹ **tự cấu hình danh sách kênh và link clip** được phép xem.
- Chạy nội bộ trong nhà, không phụ thuộc dịch vụ bên thứ ba.

## 2. Nguyên tắc bất di bất dịch (KHÔNG được vi phạm)

| # | Nguyên tắc | Lý do |
|---|---|---|
| P1 | **Whitelist-only.** Trẻ chỉ thấy video bố mẹ đã duyệt từng cái. | Không tin thuật toán đề xuất. |
| P2 | **Không đề xuất, không search mở, không Shorts feed.** | Tránh hố thỏ nội dung. |
| P3 | **Video mới của kênh KHÔNG tự lên kệ.** Phải qua hàng chờ duyệt. | Kênh hôm nay lành, mai đăng gì không kiểm soát được. |
| P4 | **Trẻ không thể thoát ra YouTube.com hay trình duyệt.** | Overlay chặn toàn bộ click vào iframe + PWA fullscreen. |
| P5 | **Giới hạn thời gian do server quyết định**, không phải client. | Client có thể bị reload để reset. |
| P6 | **Không gửi dữ liệu của con ra ngoài.** Chỉ LAN. | Quyền riêng tư. |
| P7 | **Mở app là thấy nội dung ngay** — đọc từ SQLite local, không chờ gọi YouTube. | Trẻ không kiên nhẫn. |

## 3. Quyết định kỹ thuật đã chốt

| Hạng mục | Quyết định | Ngày |
|---|---|---|
| Thiết bị đích | **Tablet Android/iPad** (cảm ứng) **+ trình duyệt sẵn trên smart TV** (remote D-pad / con trỏ) — cả hai đều first-class | 2026-09-29 |
| Chế độ phát | **Hybrid**: mặc định nhúng YouTube; video ưu tiên được `yt-dlp` tải sẵn về SSD | 2026-09-29 |
| Backend | **Node 22 + Fastify 5 + SQLite** (better-sqlite3) | 2026-09-29 |
| Frontend | **Vite + React + TypeScript + Tailwind**, dạng **PWA** | 2026-09-29 |
| Triển khai | Docker Compose trên Pi 5 (arm64), reverse proxy Caddy, chỉ trong LAN | 2026-09-29 |
| Nguồn metadata | RSS feed (chính) → HTML scrape (resolve handle) → yt-dlp (fallback + duration) → Data API v3 (tuỳ chọn) | 2026-09-29 |
| TV | ~~Pi cắm HDMI + Chromium kiosk~~ → **Trình duyệt sẵn trên LG smart TV (webOS)**. **KHÔNG** làm Chromecast receiver. | 2026-09-29 (sửa) |

### Vì sao không Chromecast
Cast iframe YouTube thì được, nhưng cast **file local** đòi dựng Cast Web Receiver
riêng — phức tạp không tương xứng lợi ích.

### Hệ quả của việc dùng trình duyệt trên LG webOS (quan trọng)

Trình duyệt của LG smart TV là **Chromium, nhưng bị đóng băng ở phiên bản cũ**:

| webOS | Năm | Nhân Chromium |
|---|---|---|
| 6.0 | 2021 | ~79 |
| 22 | 2022 | ~94 |
| 23 | 2023 | ~108 |
| 24 / 25 | 2024–25 | ~108+ |

Lấy **Chromium 79 làm sàn** (TV cũ nhất còn dùng) → ràng buộc bắt buộc khi code:

| Tính năng | Cần Chromium | Kết luận | Cách xử lý |
|---|---|---|---|
| `color-mix()` | **111** | ❌ **Không TV LG nào có**, kể cả mới nhất | Token màu tính trước + `withAlpha()` sinh `rgba()` |
| `:has()` | 105 | ❌ Không dùng | — |
| `aspect-ratio` | 88 | ⚠️ Thiếu trên webOS 6 | Fallback `padding-bottom: 56.25%` |
| `:focus-visible` | 86 | ⚠️ Thiếu trên webOS 6 | Fallback `:focus` + `@supports selector()` |
| `gap` trong flex | 84 | ⚠️ Thiếu trên webOS 6 | Fallback `margin-right` |
| `?.` và `??` | 80 | ⚠️ Thiếu trên webOS 6 | **Build target `es2019`** để esbuild dịch xuống |
| `backdrop-filter` | 76 | ✅ Có | — |
| WebAudio, localStorage, fetch | — | ✅ Có | — |
| Cài PWA | — | ❌ webOS không hỗ trợ | Xem bên dưới |

#### Điều KHÔNG khắc phục được bằng code

- **Không cài được PWA trên webOS** → nguyên tắc P4 **yếu đi trên TV**: trẻ bấm
  Back/Home trên remote là ra khỏi app. Không có cách nào chặn từ phía web.
  Khuyến nghị bù: dùng **khoá phụ huynh của chính TV LG** (Cài đặt → An toàn →
  Khoá ứng dụng) để chặn đổi app, hoặc chấp nhận và chỉ dựa vào quota.
- **Remote LG Magic Remote có HAI chế độ**: con trỏ (chỉ và bấm) và D-pad
  (4 phím mũi tên). Phải hỗ trợ **cả hai** — không giả định chỉ một.
- **Nút Back của remote**: LG gửi `keyCode 461` (Samsung `10009`), trình duyệt
  có thể còn tự lùi lịch sử. `lib/back.ts` bắt mọi kiểu phím Back; với phím
  Back của remote thì đợi ~250ms — thấy `popstate` (trình duyệt đã tự lùi) thì
  thôi, không thì tự xử lý, để không bao giờ lùi hai bước. "Quay lại" trong
  app luôn LÙI lịch sử thật (`backOr` trong `lib/router.ts`) thay vì đẩy thêm
  `/home`, nên lùi bằng trình duyệt cũng về đúng chỗ. Ở trang đầu tiên thì
  Back của trình duyệt vẫn có thể thoát app.
- **Fullscreen** phải do người dùng kích hoạt: thử `requestFullscreen()` đúng lúc
  trẻ bấm chọn avatar (là user gesture), thất bại thì bỏ qua lặng lẽ.

#### Phát hiện quan trọng: nhiều kênh trẻ em CHẶN NHÚNG

Kiểm chứng thực tế với Cocomelon: YouTube trả mã lỗi **150** —
*"Chủ kênh không cho phép nhúng video này ra ngoài YouTube"*.

Đây là hạn chế của YouTube, không phải lỗi app, và ảnh hưởng tới **rất nhiều
kênh trẻ em lớn**. Cách xử lý đã cài (xem PLAN.md phần "Phát sinh thêm"):

1. Player bắt mã 101/150 → gọi `POST /api/kid/video/:id/embed-blocked`
2. Server đặt `videos.embeddable = 0`
3. Mọi truy vấn cho trẻ thêm điều kiện
   `(embeddable IS NULL OR embeddable = 1 OR local_path IS NOT NULL)`
   → video bị ẩn, trẻ không bấm vào lần thứ hai
4. Admin hiện cảnh báo + nút một bấm **"Tải offline N video này"**
5. Có `YT_API_KEY` thì biết trước qua `videos.list?part=status` → `status.embeddable`

#### Lý do mạnh để bật chế độ tải offline trên TV

iframe YouTube chạy được trên Chromium 94+, nhưng file **mp4 H.264 phát bằng
`<video>`** thì ổn định hơn nhiều trên TV, không quảng cáo, và không phụ thuộc
việc YouTube có chặn nhúng hay không. Với TV nên bật `offline_enabled`.

## 4. Tính năng bắt buộc

### 4.1 Giao diện trẻ
- [ ] Chọn profile bằng **avatar con vật** (không mật khẩu).
- [ ] Trang chủ dạng **kệ ngang** (shelf) cuộn ngang, mỗi kệ 1 emoji + 1 màu pastel.
- [ ] Card: thumbnail chiếm ≥85% diện tích, bo góc lớn, tiêu đề tối đa 2 dòng.
- [ ] Vùng bấm **≥72px**, khoảng cách card ≥16px.
- [ ] Thanh điều hướng dưới: **3 nút cực to** — Trang chủ / Yêu thích / Kênh.
- [ ] Âm thanh phản hồi khi bấm + animation scale.
- [ ] **Hoạt động cả cảm ứng và D-pad** (xem 4.5).

### 4.2 Trang xem video
- [ ] Nhúng qua `youtube-nocookie.com` + IFrame API, tham số:
      `rel=0 modestbranding=1 iv_load_policy=3 disablekb=1 fs=0 playsinline=1 controls=0`
- [ ] **Overlay trong suốt chặn 100% pointer event** vào iframe.
- [ ] **Thanh điều khiển tự viết** (play/pause, tua ±10s, âm lượng) qua JS API.
- [ ] Bắt `onStateChange === ENDED` → **destroy player ngay** trước khi endscreen hiện.
- [ ] Autoplay **mặc định TẮT**; nếu bật thì giới hạn N video liên tiếp.
- [ ] File local và stream YouTube dùng **chung một thanh điều khiển** (PlayerAdapter).

### 4.3 An toàn cho bố mẹ
- [ ] **Parent gate**: long-press icon ⚙ 3 giây → phép tính hoặc PIN 6 số.
- [ ] Quota/ngày, quota/lượt, giới hạn số video/lượt, khung giờ cho phép.
- [ ] Hết giờ → màn hình khoá "Hết giờ rồi, mai xem tiếp nhé 🌙".
- [ ] **Đếm ngược thân thiện**: còn 5 phút hiện nhân vật vẫy tay (đỡ khóc khi cắt ngang).
- [ ] Nhật ký xem: xem gì, bao lâu, bao nhiêu lần.
- [ ] (v0.3) Báo cáo Telegram hằng tối + thông báo có video chờ duyệt.

### 4.4 Trang quản trị
- [ ] Thêm nguồn bằng cách **dán link**: `@handle`, `/channel/UC...`, `/c/`, `/user/`,
      playlist, video lẻ, `youtu.be`, Shorts → tự nhận diện loại.
- [ ] **Xem trước** nguồn trước khi thêm.
- [ ] **Hàng chờ duyệt**: grid thumbnail, nút ✅/❌/🔁(để sau), duyệt hàng loạt.
- [ ] Quản lý kệ: tạo/xoá, **kéo-thả** sắp xếp thứ tự kệ và thứ tự video trong kệ.
- [ ] Gán kệ cho profile nào.
- [ ] **Bộ lọc tự động** (hỗ trợ, không thay thế duyệt tay): loại video quá dài/quá ngắn,
      video live, tiêu đề chứa từ khoá đen.
- [ ] Quản lý tải offline: xếp hàng, tiến độ %, giới hạn dung lượng tổng.

### 4.5 Hỗ trợ TV (D-pad) — thiết kế từ đầu, KHÔNG vá sau
- [ ] Mọi card là `<button>` thật, có **spatial navigation** bằng phím mũi tên
      (tìm card láng giềng theo hình học, không theo thứ tự DOM).
- [ ] **Focus ring dày 4px + scale 1.08 + shadow** — thấy rõ ở khoảng cách 3m.
- [ ] **Không dùng hover** để truyền tải thông tin nào.
- [ ] **Safe area 5%** viền ngoài (chống overscan TV).
- [ ] Hai bộ design token, **cùng một bộ component**:
      `mode=touch` (card ~180px, 4 cột) / `mode=tv` (card ~300px, 3 cột, font ×1.4).
- [ ] Tự nhận diện mode + cho override thủ công trong admin.
- [ ] **Tương thích LG webOS (sàn Chromium 79)**: không `color-mix()`, có fallback
      `:focus` / `aspect-ratio` / `gap`, build target `es2019` (xem mục 3).
- [ ] Hỗ trợ CẢ con trỏ Magic Remote VÀ D-pad.
- [ ] Thử vào fullscreen khi trẻ chọn avatar (thất bại thì bỏ qua lặng lẽ).

### 4.6 Chế độ offline (hybrid)
- [ ] `yt-dlp` tải video đã duyệt về `/media`, cap **720p**, remux mp4.
- [ ] Worker **concurrency = 1** (Pi 5 ghi SSD, không chạy song song).
- [ ] Parse `--newline` để lấy % tiến độ.
- [ ] Badge ⬇ trong UI cho video đã có bản local.
- [ ] Dọn file của video đã bị xoá khỏi kệ; giới hạn dung lượng tổng (xoá video ít xem nhất).
- [ ] **Mặc định TẮT** — bố mẹ tự bật (lý do: điều khoản YouTube là vùng xám,
      chấp nhận ở phạm vi dùng cá nhân trong nhà).

## 5. Ngoài phạm vi (đã cân nhắc và loại)

- Chromecast receiver (xem 3.1).
- Invidious/Piped proxy — hay vỡ, nặng, bảo trì mệt.
- Tài khoản/đăng nhập cho trẻ — không cần, chọn avatar là đủ.
- Bình luận, like, đăng tải — không bao giờ.
- Mở ra Internet public — chỉ LAN/Tailscale.
- Nhận diện nội dung bằng AI — không tin cậy đủ để thay bố mẹ duyệt.

## 6. Thuật ngữ

| Từ | Nghĩa |
|---|---|
| **Source (nguồn)** | Kênh / playlist / video lẻ mà bố mẹ đã thêm |
| **Shelf (kệ)** | Một hàng ngang trên trang chủ, ví dụ "BÀI HÁT 🎤" |
| **Pending (hàng chờ)** | Video đã kéo về nhưng bố mẹ chưa duyệt — trẻ KHÔNG thấy |
| **Approved (đã duyệt)** | Video được phép xem, nhưng chỉ hiện nếu đã gán vào kệ |
| **Parent gate** | Cổng chặn để trẻ không vào được trang quản trị |
| **Quota** | Giới hạn thời gian/số video |
