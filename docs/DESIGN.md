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
--card-w: 180px;  --font-title: 17px;  --font-shelf: 22px;
--nav-h: 88px;    --safe-pad: 16px;    --scale: 1;

/* mode = tv (xa 3m, remote D-pad) */
--card-w: 300px;  --font-title: 24px;  --font-shelf: 34px;
--nav-h: 112px;   --safe-pad: 5%;      --scale: 1.4;
```

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
│ 🐻 Bảo            ⏱ Còn 23 phút                 ⚙  │  header 72px (touch)
├──────────────────────────────────────────────────────┤
│  🌟 HÔM NAY XEM GÌ                                   │  nhãn kệ, màu riêng
│  ┌──────┐┌──────┐┌──────┐┌──────┐  →                 │  cuộn ngang
│  │      ││      ││      ││      │                     │
│  └──────┘└──────┘└──────┘└──────┘                     │
│  🎤 BÀI HÁT                                          │
│  ┌──────┐┌──────┐┌──────┐                            │
│  └──────┘└──────┘└──────┘                            │
├──────────────────────────────────────────────────────┤
│      🏠            ❤️            📺                  │  nav 88px, 3 nút
└──────────────────────────────────────────────────────┘
```

### Card video
```
┌────────────────────┐
│                    │  thumbnail 16:9, object-cover
│                 ⬇  │  badge góc: ⬇ đã tải / ❤️ yêu thích
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
│  │  🏠   ⏪10   ▶️/⏸   ⏩10   ━━━●────  🔊  ❤️    │ │
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
