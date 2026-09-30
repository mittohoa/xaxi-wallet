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

Bộ tám sắc nằm ở `src/lib/palette.ts`, **không** ở `tokens.css`: màu của một
danh mục là **dữ liệu**, được ghi vào CSDL lúc tạo danh mục và đi theo bản ghi
đó. CSS không bao giờ đọc tới nó.

Đo trên `#0D1117`:

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

Trên nền thẻ **trắng** thì hai sắc xanh lá và ngọc rơi xuống 2,94–2,96 — dưới
3:1 một chút. Bộ kiểm gọi đó là mức phải có "cứu trợ" chứ không phải cấm, và
cứu trợ đã có sẵn: mỗi hàng danh mục luôn kèm biểu tượng, tên và con số, cộng
một lối xem dạng bảng trong Báo cáo.

> Bộ màu cũ (`#eb6834`, `#2a78d6`, `#52514e`…) **trượt** phép kiểm: `#52514e`
> độ bão hoà 0,005 nên đọc ra xám, và `#e34948` với `#e87ba4` chỉ cách nhau
> ΔE 13,2 — mắt thường cũng khó phân biệt. `refreshCategoryColors()` đổi các
> danh mục còn mang màu cũ, nhưng chỉ khi người dùng chưa tự chọn màu khác.

Danh mục **hệ thống** — "Chi khác", "Chưa rõ", "Chuyển đi" — cố ý mang màu xám
riêng. Chúng là chỗ rót về, không phải khoản chi có ý nghĩa; cho chúng một sắc
rực rỡ thì trong biểu đồ chúng trông ngang hàng với danh mục người dùng thật sự
quan tâm, và còn chiếm mất một sắc của bộ tám.

---

### Thẻ mực lồng được trong thẻ thường

Biểu đồ chi theo ngày nằm trong thẻ tháng của Báo cáo — mà thẻ tháng là `.card`,
tức nền trắng ở chế độ sáng. Đặt thẳng biểu đồ vào đó là đưa bộ màu ra một nền
chưa từng được kiểm định.

Cách giải: một `.panel-ink` lồng bên trong thẻ. Nó vẫn tối ở cả hai chế độ, nên
luật trên vẫn đúng, và về mặt nhìn thì thành một khối lõm có chủ ý. Chỉ cần bỏ
bóng đổ — bóng vốn để tách thẻ khỏi nền trang, mà ở đây thẻ cha đã làm việc đó.

---

### Vạch trên cùng phải chứa được cột cao nhất

Thang chia làm tròn **lên** tới bội của bước. Nghe như chuyện thẩm mỹ, nhưng
không phải.

Bản đầu dừng ở vạch cuối cùng không vượt quá dữ liệu: với 18 triệu và bước 5
triệu thì trần là 15 triệu, cột cao 120% vùng vẽ và phần ngọn bị mép SVG cắt
mất. Hậu quả là **biểu đồ nói sai**: 16 triệu và 18 triệu đều tràn ra ngoài nên
vẽ ra cao bằng nhau, người đọc không có cách nào nhận ra. Gần như mọi giá trị
đều rơi vào trường hợp này — chỉ những số đúng bằng một vạch mới thoát.

`tests/charts.test.ts` quét vài nghìn giá trị để giữ đúng một bất biến: vạch
trên cùng ≥ giá trị lớn nhất, và không thừa quá một bước. Bài kiểm quét rộng đó
bắt được cả một sai sót trong chính bản sửa — sai số `0.001` dùng trên tỉ lệ đã
nuốt mất 2.500 đ khi bước là 2,5 triệu.

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

### Trạng thái khoá tô bằng màu, không bằng độ mờ

`opacity` làm nhạt nền và chữ **cùng lúc**, nên cả hai trôi về phía màu trang và
tương phản giữa chúng sụp xuống. Nút gửi lúc bị khoá từng để `opacity: 0.26`:
đo trên nền sáng chỉ còn **1,72:1** — dưới cả ngưỡng 3:1 của một hình không phải
chữ. Trên máy thì mũi tên gần như biến mất, và nút trông như hỏng chứ không phải
đang chờ.

Đặt thẳng hai màu từ token thì đo được 5,38:1 nền sáng và 5,13:1 nền tối. Quy
tắc: **trạng thái khoá đổi token màu, không hạ độ mờ.**

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

---

## 10. Biểu tượng: vector cho thứ app vẽ, emoji cho thứ người dùng chọn

Cả bộ biểu tượng giao diện nằm trong `src/components/Icon.tsx`: nét chứ không tô
đặc, lưới 24, `currentColor`, cỡ theo `1em`.

### Vì sao emoji sai chỗ trong giao diện

Emoji do **hệ điều hành** vẽ, không phải app. Cùng một ký tự ⚙️ ra bốn hình khác
nhau trên Samsung, Windows, macOS và Tauri. Một bộ thiết kế kiểm soát tới từng
token màu mà lại để hệ điều hành chọn hộ hình dạng của chính cái nút thì mâu
thuẫn với chính nó.

Nặng hơn: emoji là hình nhiều màu cố định. Chúng không nghe `currentColor`, nên
không đổi theo nền sáng/tối, không nhạt đi khi nút bị khoá, và đâm thẳng vào bộ
tám màu đã đo đạc ở §1.

Và có một lỗi âm thầm đã nằm sẵn trong mã trước khi làm việc này: các ký tự
`⚠ ⬇ ⬆ 🗜` không kèm dấu chọn kiểu hiển thị, nên nền tảng tự quyết vẽ chúng
thành chữ đen trắng hay thành emoji nhiều màu. Trên cùng một màn hình Cài đặt,
có biểu tượng ra đen trắng còn biểu tượng ngay cạnh ra đầy màu — tuỳ máy. Không
ai thấy lỗi này trên máy của người viết mã.

### Ranh giới

| | Vẽ bằng gì | Vì sao |
|---|---|---|
| Nút, thanh, nhãn trạng thái, trạng thái rỗng | vector | app vẽ, app chịu trách nhiệm |
| Danh mục, ví, mục tiêu, sáu hũ | emoji | **dữ liệu** — người dùng tự chọn, nằm trong IndexedDB |

Đổi nhóm thứ hai sang vector nghĩa là lấy mất quyền chọn của người dùng và phải
di trú dữ liệu cũ. Kết quả trên màn hình lại hoá ra đẹp hơn dự tính: emoji nhiều
màu chỉ xuất hiện ở cột dữ liệu, còn toàn bộ khung giao diện đơn sắc — nhìn ra
ngay đâu là thứ mình nhập vào.

Có một chỗ bị ép giữ emoji vì lý do kỹ thuật chứ không phải thiết kế: biểu tượng
loại ví nằm trong thẻ `<option>`, mà `<option>` chỉ nhận chữ, không vẽ được SVG.

### Ba luật được canh bằng bài kiểm

`tests/icons.test.ts` giữ những điều dưới đây, vì bằng mắt thì không thấy — trên
máy của người viết mã nó vẫn đẹp.

1. **Không emoji nào lọt vào giao diện.** Bài kiểm chỉ bắt *hình vẽ*, không bắt
   dấu câu: mũi tên trong một câu văn là dấu câu thật, đôi khi nằm trong cả
   thông báo toast — nơi không đặt được thẻ SVG. Nhưng một ký tự **đứng một mình
   trên một dòng** thì không phải dấu câu, đó là toàn bộ nội dung của một cái
   nút, và chỗ đó bị cấm.
2. **Không hình nào viết cứng mã màu.** Cả bộ đi theo `currentColor`, nên nút bị
   khoá thì nhạt, dòng cảnh báo thì đỏ theo, nền tối thì sáng lên. Một hình lỡ
   ghi mã màu sẽ đứng im giữa tất cả những thứ đó và chỉ lộ ra khi có người mở
   nền tối.
3. **Không biểu tượng nào vẽ ra mà không có nơi dùng.** Luật này bắt được ngay
   bốn hình loại ví vừa vẽ xong đã thành mã chết vì `<option>`.

### Biểu tượng tự đặt màu là sai, trừ khi nó đứng một mình

Trong hầu hết trường hợp thẻ cha đã tô cả dòng theo trạng thái rồi — thêm màu
cho riêng biểu tượng là ghi đè lên chính màu đó. `currentColor` lo phần này.
Chỉ dùng `.icon.ok` khi biểu tượng đứng một mình không có dòng chữ nào mang màu
sẵn — và đó là lớp phủ màu duy nhất còn lại, vì `.icon.warn` viết ra xong thì
không chỗ nào cần tới.

### Chỗ duy nhất biểu tượng phải có nhãn

Mũi tên tăng/giảm trong `<Delta>` tồn tại để **không phải dựa vào màu** (§3).
Nếu đặt `aria-hidden` cho nó thì người dùng trình đọc màn hình chỉ nghe thấy
"12%" mà không biết 12% theo hướng nào — tức là mất đúng thông tin mà cái mũi
tên sinh ra để mang. Nên nó là biểu tượng duy nhất trong app có `aria-label`.

---

## 11. Rà trên máy thật

```
npm run device:check
```

Mười sáu phép kiểm chạy qua đúng giao diện trên thiết bị đang nối, cộng hai
phép kiểm ở lớp Android mà không mã JavaScript nào chạm tới được: chia sẻ tin
nhắn vào app, và nút Back.

**Vì sao cần, khi đã có hơn 150 bài kiểm thử:** mọi lỗi đáng kể tìm được trong
quá trình làm app này đều nằm ở ranh giới giữa lớp web và lớp Android, và không
bài kiểm thử nào bắt được — vì chúng gọi thẳng vào hàm, còn lỗi thì nằm ở chỗ
hai lớp gặp nhau:

- nội dung chia sẻ vào app bị vứt đi, mà app vẫn mở lên bình thường;
- nút Back đóng luôn app ở mọi màn hình;
- xuất sao lưu không tạo ra tệp nào nhưng vẫn báo "đã xuất";
- cột biểu đồ chi tô đen kịt vì một biến CSS đổi tên.

Cả bốn đều **im lặng**. Thứ bắt được chúng là chạy app thật rồi nhìn.

Cần bản **debug** đang cài: bản phát hành cố ý không mở cổng gỡ lỗi.

Vài phép kiểm nạp dữ liệu mẫu, tức ghi đè giao dịch. Script sao lưu toàn bộ CSDL
trước khi chạy và trả lại sau, kể cả khi có phép kiểm hỏng giữa chừng.

---

## 12. Số dư là một VẬT THỂ, không phải một con số trôi trên nền

Đặt màn hình chính cạnh bộ mẫu tham khảo trong `docs/template/UI/`, khác biệt
lớn nhất không phải màu hay phông: **mẫu nào cũng biến số dư thành một tấm thẻ**
— có nền, có màu thương hiệu, có thông tin phụ nằm bên trong nó.

Bản cũ để con số trần trên nền. Kết quả là màn hình có trọng tâm CHỮ nhưng không
có trọng tâm THỊ GIÁC: mắt không biết nhìn vào đâu trước, và cả trang đọc ra như
một bảng điều khiển chứ không ra một app.

`.hero-card` mang màu lime ở **cả hai** chế độ sáng và tối, cùng luật với
`.panel-ink` (§2): màu thương hiệu là cố định, nên chỉ phải kiểm định một lần.
Chữ trên thẻ dùng `--accent-ink` chứ không phải token chữ thường — nền lime luôn
sáng, nên chữ luôn phải tối, kể cả khi cả app đang ở chế độ tối.

Vệt sáng chéo trong thẻ là hình tròn trắng 13% bị cắt bởi `overflow: hidden`.
Một mảng màu phẳng cỡ đó nhìn ra tấm giấy dán; đây là cách rẻ nhất để có chiều
sâu mà không thêm một tệp ảnh nào.

### Hàng lối tắt: cấu trúc, và một câu trả lời cho "app này làm được gì"

Bốn nút tròn có nhãn ngay dưới thẻ — Ghi khoản · Chuyển ví · Đối soát · Báo cáo.

Chúng **không thay ô nhập**; gõ vẫn là đường chính và vẫn nhanh nhất. Nhưng bộ
mẫu nào cũng có một hàng như thế, và nó làm hai việc mà ô nhập không làm được:
cho màn hình một cấu trúc để mắt bám vào, và cho người mới biết app làm được gì
mà không phải đoán nên gõ chữ nào.

Chip "Ghi đầy đủ" ở đáy bị bỏ — nút tròn đã gọi đúng lệnh đó và nổi hơn nhiều.
Chỗ trống nhường cho các lối tắt app tự học từ thói quen người dùng.

### Một bài kiểm hỏi sai câu

Bài "các nút mở màn hình trên trang chính vẫn còn" khoá cứng vào `.chip` chứa
chữ "Ghi đầy đủ". Lối tắt đó chuyển lên hàng nút tròn là nó đỏ lên, dù chẳng mất
gì cả — nó canh đúng thứ nhưng hỏi sai câu.

Đã đổi sang duyệt **mọi nút** và tìm theo nhãn, đồng thời canh luôn cả ba lối
tắt còn lại. Một bài kiểm đỏ lên vì lý do sai chỉ dạy người ta bỏ qua nó.
