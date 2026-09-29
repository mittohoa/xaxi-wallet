# Hệ thống thiết kế XAXI

Tài liệu này giải thích **vì sao**, không phải **cái gì**. Giá trị cụ thể nằm ở
`src/styles/tokens.css` và là nguồn sự thật duy nhất — tài liệu có thể lạc hậu,
mã thì không.

---

## 0. Nguồn gốc

Bộ này được dựng sau khi xem 27 thiết kế ứng dụng tài chính trong
`docs/template/UI/`. Những gì chúng nhất trí với nhau đã được lấy; những gì
chúng làm mà mâu thuẫn với XAXI đã bị bỏ.

**Lấy về:**

| Khuôn | Vì sao hợp với XAXI |
|---|---|
| Con số dẫn dắt cỡ lớn ở đầu màn hình | Thứ người dùng liếc vào đầu tiên |
| Hai ô số liệu Thu / Chi cạnh nhau | Có mặt trong gần như mọi thiết kế; hai con số này là câu hỏi thứ hai |
| Nhãn "+12% so kỳ trước" | **Thêm nhiều thông tin mà không đòi nhập thêm gì** — đúng bộ lọc quyết định của app |
| Thanh tiến trình dưới mỗi danh mục | Đọc nhanh hơn con số, và lộ ngay danh mục lệch |
| Thẻ tối nổi trên trang sáng cho biểu đồ | Vừa là khuôn hay gặp, vừa giải được bài toán màu (mục 2) |
| Bo góc lớn, phân tầng bằng nền | Khác biệt lớn nhất giữa app và trang web đặt trong khung điện thoại |

**Bỏ đi:**

| Khuôn | Vì sao không |
|---|---|
| Thanh tab dưới đáy | Đã bỏ có chủ ý: "ô nhập là toàn bộ app" |
| Ảnh đại diện, chuyển tiền cho người khác | XAXI không có tài khoản, không có mạng xã hội |
| Thẻ VISA, số thẻ, nối ngân hàng | XAXI không bao giờ hỏi thông tin ngân hàng |
| "Get Pro", gói trả phí | Không có |
| Trợ lý AI dạng bong bóng chat toàn màn hình | Ô nhập đã trả lời câu hỏi rồi; thêm một màn hình nữa là thêm một bước |

---

## 1. Màu đi ra từ logo

Dấu hiệu là hai đường xu hướng: **chanh `#B8FF3D`** đi lên, **đỏ `#E34948`** đi
xuống, trên nền **mực `#0D1117`**. Ba màu đó trở thành:

- chanh → màu nhấn (nút chính, tiêu điểm, đường thu trong biểu đồ)
- đỏ → dòng tiền ra
- mực → nền của chế độ tối, và nền của mọi thẻ biểu đồ

Chế độ tối dùng đúng nền mực của logo. App chính là cái logo.

**Chanh không bao giờ làm màu chữ trên nền sáng.** `#B8FF3D` trên trắng chỉ đạt
1,2:1. Vì vậy có `--accent` (nền nút) tách khỏi `--accent-text` (chữ, liên kết,
viền tiêu điểm) — hai biến, hai công dụng, không thay nhau được.

---

## 2. Biểu đồ luôn nằm trên nền mực

`.panel-ink` tối ở **cả hai** chế độ sáng và tối.

Đây không phải quyết định thẩm mỹ mà là quyết định kỹ thuật: nhờ nó, cả app chỉ
cần **một** bộ màu biểu đồ đã kiểm định thay vì hai bộ phải kiểm riêng trên hai
nền. Một bộ thì kiểm được, hai bộ thì sớm muộn một bộ sẽ trôi.

Bộ tám sắc `--c-1` … `--c-8`, đo trên `#0D1117`:

```
Dải độ sáng      ✓ cả 8 nằm trong OKLCH L 0,48–0,67
Sàn độ bão hoà   ✓ cả 8 ≥ 0,10
Loạn sắc         ✓ hai màu cạnh nhau thấp nhất ΔE 12,1 (protan)
Mắt thường       ✓ thấp nhất ΔE 16,6
Tương phản nền   ✓ cả 8 ≥ 3:1
```

**Thứ tự của tám sắc là kết quả tìm kiếm, không phải sắp cho đẹp.** Đã thử mọi
hoán vị để hai màu cạnh nhau cách xa nhau nhất với người loạn sắc. Đổi thứ tự
là phá phép đo.

---

## 3. Màu không bao giờ là dấu hiệu duy nhất

Đã thử tìm bộ 5 và 6 sắc vượt qua phép kiểm **mọi cặp** (không chỉ cặp cạnh
nhau) với người loạn sắc. **Không có bộ nào.** Với người mù màu đỏ–lục thì cam
và xanh lá luôn chập vào nhau, bất kể chọn thế nào.

Kết luận không phải "chọn màu khéo hơn" mà là **màu không được mang nghĩa một
mình**:

- mỗi danh mục trong biểu đồ luôn kèm biểu tượng và tên đứng ngay bên cạnh;
- nhãn so sánh có mũi tên ↑↓ chứ không chỉ đổi màu;
- trạng thái ngân sách có chữ ("Vượt ngân sách") chứ không chỉ đổi màu thanh;
- mọi biểu đồ đều có một lối xem dạng bảng.

---

## 4. Đỏ được dành riêng

| Vai | Biến | Dùng khi |
|---|---|---|
| Dòng tiền ra | `--down` | Mọi khoản chi. Đỏ trầm. |
| Cảnh báo | `--warning` | Sắp chạm hạn mức, tiêu nhanh hơn nhịp |
| Nghiêm trọng | `--critical` | Vượt ngân sách, số dư âm, nút xoá |

Nếu mọi dòng chi đều đỏ gắt thì màu đỏ hết nghĩa đúng lúc cần nó nhất. Một màn
hình đầy khoản chi phải đọc như một bản ghi, không phải như một màn hình lỗi.

Đã đo: mọi màu chữ ngữ nghĩa đạt WCAG AA (≥ 4,5:1) trên cả hai nền, chữ mờ đạt
mức chữ lớn (≥ 3:1).

---

## 5. Thang đo

**Khoảng cách** gốc 4px: `--s-1` … `--s-12`. Không có giá trị nào ngoài thang.

**Chữ**: `--t-2xs` (11px) … `--t-2xl` (24px), cộng hai cỡ co theo màn hình cho
con số dẫn dắt. 11px là sàn — dưới mức đó trên điện thoại không ai đọc.

Chữ càng lớn càng bó chặt: `--track-tight` cho con số lớn, `--track-caps` cho
nhãn viết hoa nhỏ.

**Bo góc**: `--r-xs` (8) … `--r-xl` (28) và `--r-pill`. Khối càng lớn góc càng
tròn.

---

## 6. Phân tầng bằng nền, không bằng đường kẻ

Trang (`--page`) → thẻ (`--surface`) → ô nhập (`--surface-2`) → nhấn (`--surface-3`).

Giao diện web thô viền 1px quanh mọi thứ. App native tách tầng bằng đổi nền và
nhấc lên bằng bóng. Đường kẻ chỉ dùng cho **phân cách trong cùng một tầng**
(giữa hai dòng trong một danh sách), và luôn thụt vào sau biểu tượng.

Chế độ tối không có bóng — bóng đen trên nền đen là vô hình. Ở đó thẻ dùng viền
mảnh `--line` để tách khỏi trang.

---

## 7. Vùng chạm và phản hồi

Không gì chạm được nhỏ hơn **44px**. Đây là app nhập liệu nhanh bằng một tay
trên đường; chạm trượt một lần là mất hẳn một khoản chi.

Mọi thứ chạm được đều `transform: scale(0.95)` khi nhấn. Phản hồi tức thì là
thứ phân biệt cảm giác native với cảm giác trang web — trước cả khi dữ liệu kịp
đổi.

Ô nhập số tiền để cỡ 16px trở lên, nếu không iOS tự phóng to cả trang khi gõ.

---

## 8. Luật của tầng token

Một nguồn sự thật duy nhất: **chỉ `tokens.css` được định nghĩa biến**. Mọi tệp
khác chỉ được dùng.

Và **không được ghép tên biến bằng chuỗi**. Ba chỗ trong app từng dựng tên biến
từ một giá trị chạy lúc chạy; khi token đổi tên, cả ba gãy cùng lúc — CSS không
phân giải được `var()` thì im lặng đổ về mặc định, nên cột biểu đồ chi hoá đen
kịt và thanh xếp hạng hoá trong suốt. Trình biên dịch không thấy, grep không
thấy, chỉ mắt người nhìn lên máy thật mới thấy.

Dùng hàm có kiểu thay thế, ví dụ `flowColor(kind)`.

`tests/tokens.test.ts` canh cả ba luật này.

---

## 9. Thứ tự nhập

```
tokens → base → layout → components → screens → motion
```

Không đổi được: token phải có trước mọi thứ dùng nó, và màn hình phải sau bộ
phận để đè lên được mà không cần `!important`.
