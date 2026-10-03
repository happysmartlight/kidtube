# DESIGN — KidTube Home

## Triết lý

1. **Thumbnail là vua.** Trẻ chưa đọc chữ. Ảnh phải to, sắc, chiếm ≥85% card.
2. **Màu + emoji thay chữ.** Trẻ nhớ "kệ màu hồng có nốt nhạc", không nhớ chữ "BÀI HÁT".
3. **Không có trạng thái mơ hồ.** Mỗi lúc chỉ có một việc rõ ràng để làm.
4. **Sai không hại.** Bấm sai nút tệ nhất là về trang chủ. Không có gì xoá được, mua được.
5. **Một bộ component, hai bộ token.** Không fork UI cho TV.

## Design token

```css
/* Chung */
--radius-card: 24px;     --radius-btn: 999px;
--gap-card: 16px;        --focus-ring: 4px;
--ease-pop: cubic-bezier(.34, 1.56, .64, 1);   /* nảy nhẹ, trẻ thích */

/* mode = touch (tablet) */
--card-w: 180px;  --font-title: 17px;
--nav-h: 72px;    --tab-h: 48px;       --tabs-pad-y: 12px;
--safe-pad: 16px; --tap: 72px;         --scale: 1;

/* mode = tv (xa 3m, remote D-pad) */
--card-w: 300px;  --font-title: 24px;
--nav-h: 92px;    --tab-h: 62px;       --tabs-pad-y: 16px;
--safe-pad: 5%;   --tap: 88px;         --scale: 1.4;
```

Không còn `--header-h`: avatar bé, đồng hồ và nút ⚙ đã gộp xuống thanh dưới
(`--nav-h`), nên đỉnh màn hình chỉ còn hàng nút chọn chủ đề.

`data-mode="touch"|"tv"` đặt trên `<html>`. Mọi component đọc token, không hardcode px.

### Vì sao `--safe-pad: 5%` cho TV
Nhiều TV vẫn cắt mép ảnh (overscan). 5% mỗi bên là mức an toàn tiêu chuẩn.
Nội dung sát mép sẽ bị mất trên TV cũ.

## Bảng màu

Nền tối dịu (không đen thuần — đỡ chói khi xem tối), các kệ màu pastel.

```
Nền:        #16131f  (tím đen rất đậm)
Nền card:   #241f33
Chữ chính:  #f6f3ff      Chữ phụ: #a79cc4
Focus ring: #ffd23f  (vàng, tương phản cao trên mọi thumbnail)

Màu kệ (pastel, dùng cho viền + nhãn + glow):
  đỏ hồng  #ff6b8a      cam     #ff9f43
  vàng     #ffd23f      xanh lá #4ecb71
  xanh lơ  #4ecdc4      xanh dương #5b9cff
  tím      #a78bfa      hồng    #f472b6
```

Tương phản chữ chính trên nền: ~14:1 — vượt WCAG AAA.
Focus ring vàng trên nền tối: ~11:1.

## Bố cục

### Trang chủ (trẻ)
```
┌──────────────────────────────────────────────────────┐
│ (⭐HÔM NAY 700)(🎤BÀI HÁT 100)(🔢HỌC CHỮ 60)  →      │  nút chọn chủ đề,
├──────────────────────────────────────────────────────┤  DÍNH, --tab-h 48px
│  ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐            │  lưới của kệ đang
│  └──────┘└──────┘└──────┘└──────┘└──────┘            │  chọn, auto-fill,
│  ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐            │  CUỘN DỌC
│  └──────┘└──────┘└──────┘└──────┘└──────┘            │
│  ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐            │
│  └──────┘└──────┘└──────┘└──────┘└──────┘            │
│              ⬇️ Xem thêm (còn 640)                   │
├──────────────────────────────────────────────────────┤
│ 🐻Bảo          🏠      📺          ⏱ Còn 23'    ⚙  │  thanh dưới 72px
└──────────────────────────────────────────────────────┘
```

**Chỉ có MỘT thanh điều khiển, nằm dưới.** Avatar bé (đổi bé), đồng hồ và nút
⚙ trước đây ở header riêng phía trên; đã gộp xuống đây vì cả ba đều là *điều
khiển* chứ không phải *nội dung*. Đỉnh màn hình nhường hết cho hàng nút chọn
chủ đề. Hai cụm hai bên dùng `flex: 1` để hai nút chính luôn nằm chính giữa dù
tên bé dài ngắn khác nhau.

Màn hình hẹp thì bỏ chữ theo thứ tự: tên bé (≤820px) → nhãn 2 nút chính và
thu nhỏ đồng hồ + nút ⚙ (≤640px). Emoji và avatar luôn giữ — đó là thứ trẻ
nhận dạng bằng mắt.

Trang chủ KHÔNG xếp chồng các kệ theo chiều dọc nữa. Lý do: kệ đầu có hàng
trăm video thì trẻ phải cuộn rất lâu mới tới kệ sau — thực tế là không bao
giờ biết bên dưới có gì. Hàng nút dính ở đầu cho mọi chủ đề cách một cú chạm.
Tab **Kênh** dùng y hệt bố cục này (nguồn dữ liệu khác) — hai layout khác
nhau là thứ trẻ phải học hai lần.

### Card video
```
┌────────────────────┐
│                    │  thumbnail 16:9, object-cover
│                 ⬇  │  badge góc: ⬇ đã tải
│              12:04 │  thời lượng góc phải dưới
├────────────────────┤
│ Tên video chỉ hai  │  max 2 dòng, line-clamp
│ dòng là hết...     │
└────────────────────┘
```
Focus/hover: `scale(1.08)` + ring 4px màu kệ + shadow glow.
Transition 180ms `--ease-pop`.

### Trang xem
```
┌──────────────────────────────────────────────────────┐
│                                                       │
│              [ video toàn màn hình ]                  │
│         ┌─ overlay chặn 100% pointer ─┐               │
│                                                       │
│  ┌─ thanh điều khiển (ẩn sau 3s, tap để hiện) ─────┐ │
│  │  🏠   ⏪10   ▶️/⏸   ⏩10   ━━━●────  🔊        │ │
│  └───────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```
Nút trong thanh: 64px (touch) / 88px (tv). Nút ▶️ giữa to hơn 1.4×.

## Quy tắc D-pad (TV)

| Phím | Hành vi |
|---|---|
| ↑ ↓ ← → | Di chuyển focus theo hình học tới card láng giềng gần nhất |
| Enter / Space | Bấm element đang focus |
| Escape / Backspace | Quay lại (trang xem → trang chủ) |
| Trong player: ← → | Tua ∓10s (không di chuyển focus) |
| Trong player: ↑ ↓ | Âm lượng |

**Bắt buộc:**
- Mọi thứ bấm được phải là `<button>` thật, có `data-focusable`.
- Focus phải luôn `scrollIntoView({block:'nearest', inline:'center'})`.
- Khi vào trang mới, focus tự động về item đầu tiên có ý nghĩa.
- **Không dùng `:hover` để truyền tải thông tin** — TV không có con trỏ.
- Không có bẫy focus: từ bất cứ đâu cũng phải tới được nav dưới.

## Âm thanh

Sinh bằng WebAudio (không cần file mp3, không tốn băng thông):

| Sự kiện | Âm |
|---|---|
| Di chuyển focus | "tick" 1200Hz, 25ms, rất nhẹ |
| Bấm chọn | "pop" 660→990Hz, 90ms |
| Quay lại | "pop" ngược 880→550Hz |
| Sắp hết giờ | 3 nốt chuông dịu |
| Hết giờ | hợp âm giảm dần |

Có thể tắt hết trong cài đặt (`sfx_enabled`).

## Khả năng tiếp cận

- Vùng bấm tối thiểu **72×72px** (vượt chuẩn WCAG 44px — tay trẻ nhỏ kém chính xác).

  **Ngoại lệ có chủ ý: thanh nav dưới và hàng nút chọn chủ đề.** Hai thanh này
  cao 64px và 48px (touch), thấp hơn 72px, để nhường diện tích cho lưới video —
  trước đây header + nút chủ đề + nav ăn ~33% chiều cao màn hình tablet. Chấp
  nhận được vì các nút đó **rất rộng**: nút nav ~260px, nút chủ đề ~150px, nên
  tổng diện tích bấm vẫn lớn hơn nhiều so với một ô vuông 72×72. Vẫn trên chuẩn
  WCAG 44px, và ngang tầm thanh tab của iOS (49pt) / Android (56dp).
  **Mọi vùng bấm gần vuông vẫn phải giữ `--tap`** (72px touch / 88px tv).
- Mọi icon-button có `aria-label`.
- Không truyền tải thông tin **chỉ** bằng màu (luôn kèm emoji/chữ).
- Tôn trọng `prefers-reduced-motion` → tắt animation nảy.
- Tương phản chữ ≥ 7:1.

## Chữ

```
font-family: "Baloo 2", "Nunito", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
```
Baloo 2 và Nunito đều **hỗ trợ đầy đủ dấu tiếng Việt** và có dáng tròn, thân thiện.
Tải từ Google Fonts với `font-display: swap`; **nếu offline thì fallback system-ui** —
app vẫn dùng được bình thường, chỉ khác dáng chữ.
