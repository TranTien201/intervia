# Thiết kế giao diện

- Cập nhật: 2026-10-11
- Trạng thái: **bảng màu Sương lam dùng tạm**, có thể đổi sau. Các mục khác là đề xuất, chưa chốt.
- Xem thử bấm được: `docs/design/ui-preview.html` (mở bằng trình duyệt; mặc định hiện Sương lam, có thể chuyển sang các bảng màu khác để so sánh).

---

## 1. Hướng thiết kế

Giao diện giống một căn phòng phỏng vấn yên tĩnh: nền sáng dịu, chữ dễ đọc, một màu nhấn duy nhất. Màu sắc chủ yếu dùng để báo trạng thái (ai đang nói, máy có đang nghe không, có lỗi không), không để trang trí.

**Nguyên tắc:**
1. **Câu hỏi là nhân vật chính.** Câu hỏi của AI dùng cỡ chữ lớn nhất trên màn hình phỏng vấn (17–18px).
2. **Luôn biết đến lượt ai.** Một viên trạng thái cố định ở thanh dưới, mỗi trạng thái có màu, chữ và chuyển động riêng (xem mục 4).
3. **Không chấm điểm, không phán xét trong phiên.** Chỉ hiện tiến độ "Câu 4/~12".
4. **"Chưa đánh giá" không dùng màu đỏ.** Hiện màu chữ phụ, in nghiêng. Màu đỏ chỉ dành cho lỗi và hành động xóa dữ liệu.
5. **Không có ngõ cụt.** Mic lỗi thì chuyển sang gõ chữ; mất mạng thì có banner "đang kết nối lại"; im lặng lâu thì nhắc nhẹ.
6. **Ít khung, nhiều khoảng trắng.** Chỉ đóng khung những thứ là một đối tượng riêng. Bo góc 8–12px, đổ bóng rất nhẹ.

## 2. Bảng màu: Sương lam (dùng tạm)

Chọn sau khi so sánh năm bảng màu (bản đầu bị chói vì thẻ trắng tinh và chữ tương phản 15:1). Sương lam: xám ngả xanh dương nhạt, màu nhấn xanh mòng két trầm. Chỉ có giao diện sáng; màu được khai báo thành token nên thêm giao diện tối sau này chỉ cần thêm một bộ giá trị.

| Token | Hex | Dùng cho |
|---|---|---|
| `--bg` | `#E8EDEF` | Nền trang |
| `--surface` | `#F3F6F7` | Thẻ, ô nhập, thanh trên/dưới, bong bóng câu trả lời. **Không dùng trắng tinh `#FFFFFF`** |
| `--subtle` | `#DCE4E7` | Tag kỹ năng, nút đang chọn, thanh tiến độ trống |
| `--line` | `#CDD7DB` | Viền thẻ, đường kẻ chia cột |
| `--ink` | `#26343A` | Chữ chính, câu hỏi của AI |
| `--ink2` | `#56666D` | Chữ phụ, nhãn, chữ STT đang nghe, "Chưa đánh giá" |
| `--accent` | `#3A6770` | Nút chính, "Đang nghe bạn", nhãn "Bạn", thanh độ phủ |
| `--accent-soft` | `#D8E6E9` | Nền của "Đang nghe", nhãn "Bắt buộc", tab đang mở |
| `--accent-strong` | `#30565E` | Nút chính khi hover |
| `--ai` / `--ai-soft` | `#5B5F86` / `#E2E3EE` | Nhãn "Người phỏng vấn", trạng thái "AI đang nói" |
| `--amber` / `--amber-soft` | `#7F5E2A` / `#EFE6D4` | "Đang xử lý", "Cứ từ từ suy nghĩ", gợi ý, sự kiện nhắc lại/bỏ qua |
| `--ok` / `--ok-soft` | `#436A4D` / `#DCE9E0` | Đã lưu, bước đã xong |
| `--danger` / `--danger-soft` | `#9A4B41` / `#F0DFDB` | Chỉ cho lỗi và nút xóa dữ liệu |

**Độ tương phản** (WCAG 2.1, chuẩn AA cần ≥ 4,5:1), đã kiểm tra:
- `--ink` trên `--surface`: 11,8:1; trên `--bg`: 10,9:1
- `--ink2` trên `--bg` / `--subtle` / `--surface`: 5,1 / 4,6 / 5,5
- Chữ trắng trên `--accent`: 6,3:1
- Mỗi màu trạng thái trên nền nhạt cùng tông (`--accent`/`--accent-soft`, `--ai`/`--ai-soft`…): đều ≥ 4,5:1

## 3. Chữ

- **Be Vietnam Pro** (400/500/600/700) cho toàn bộ giao diện: thiết kế riêng cho dấu tiếng Việt, giấy phép OFL.
- **JetBrains Mono** cho code ứng viên gõ.
- Tự host qua Fontsource, không phụ thuộc Google Fonts lúc chạy.

| Vai trò | Cỡ / độ đậm |
|---|---|
| Tiêu đề trang | 28 / 600 |
| Câu hỏi AI | 18 / 400, line-height 1.6 |
| Thân | 15 / 400 |
| Nhãn | 12 / 600, chữ hoa, giãn chữ 0.08em |
| Code | 14 mono |

## 4. Trạng thái voice

| Trạng thái | Màu | Chuyển động | Ghi chú |
|---|---|---|---|
| Đang kết nối | `subtle` + `ink2` | Ba chấm | Kèm banner nếu mất mạng; sau vài giây có nút chuyển sang gõ chữ |
| Đang nghe bạn | `accent-soft` + `accent` | Sóng âm | Bật theo sự kiện VAD, không chờ STT (STT trễ 0,5–2s) |
| Cứ từ từ suy nghĩ | `amber-soft` + `amber` | Chấm tĩnh | Im lặng lâu; không cắt lượt |
| Đang xử lý | `amber-soft` + `amber` | Ba chấm | Mục tiêu < 1,5s |
| AI đang nói | `ai-soft` + `ai` | Sóng âm | Chữ hiện dần cùng giọng đọc |
| Không dùng được mic | `danger-soft` + `danger` | Chấm tĩnh | Tự chuyển sang Text, ghi rõ cách bật lại quyền mic |

Mọi trạng thái đều có chữ đi kèm, không chỉ dựa vào màu. Tắt chuyển động khi người dùng bật `prefers-reduced-motion`.
