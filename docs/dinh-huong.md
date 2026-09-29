# Định hướng phát triển XAXI

Tài liệu này ghi các hướng đang cân nhắc, kèm phân tích đánh đổi. Chưa có gì ở đây là cam kết sẽ làm.

Cập nhật gần nhất: 29/09/2026

---

## 0. Bộ lọc quyết định

Mọi tính năng phải trả lời được một trong hai câu:

> Nó **giảm công nhập liệu**, hay nó **giữ số liệu đúng khi người dùng lười**?

Không trả lời được thì không làm — kể cả khi nghe hay.

Kèm bốn ràng buộc đã chốt:

| Ràng buộc | Hệ quả |
|---|---|
| Android là nền tảng gốc | thiết kế theo ngón cái trước; web/desktop là bản rút gọn |
| Dữ liệu tài chính không rời máy **ở dạng đọc được** | xử lý on-device; khi đồng bộ thì máy chủ chỉ thấy khối đã mã hoá |
| Không nhồi model nặng vào bản cài | gói bổ trợ tải sau khi cài (ML Kit unbundled, gói giọng nói của hệ thống) |
| Hoàn tất offline rồi mới bật online | thứ tự không đảo, nhưng **lược đồ dữ liệu phải chuẩn bị cho đồng bộ ngay từ bây giờ** (xem §3.6) |

---

## 1. Đã xong

| Nhóm | Nội dung |
|---|---|
| Nhập liệu | ô nhập một dòng (ghi / hỏi / lệnh) · giọng nói · OCR biên lai · CSV · Excel · dán tin nhắn ngân hàng |
| Chống bỏ cuộc | đối soát số dư · hộp chờ phân loại · lấp khoảng trống · phân biệt "không chi" với "quên ghi" · độ phủ thay streak · nhắc theo ngưỡng |
| Học trên máy | phân loại Naive Bayes từ ghi chú của chính người dùng · phát hiện khoản định kỳ để đề xuất tự động hoá |
| Nền tảng | Android (APK 6,7 MB) · web trên GitHub Pages · desktop qua Tauri (CI build được cả 3 hệ) |

Chưa kiểm chứng bằng phần cứng thật: đường chụp ảnh bằng camera, đường nói vào micro.

---

## 2. Tham chiếu: bot Telegram quản lý chi tiêu (cộng đồng chia sẻ)

Mô hình người ta đang làm:

- Gửi tin nhắn thoại → AI chuyển thành văn bản → lưu giao dịch
- Bot quét email theo bộ lọc → tự ghi nhận giao dịch ngân hàng
- Quản lý theo **6 hũ**
- Xem / sửa / xoá giao dịch trong Telegram
- Mini App ngay trong Telegram
- Database là Google Sheet, phục vụ tới ~5.000 người dùng

### Vì sao nó đáng tham khảo

Nó giải đúng bài toán XAXI đang giải — giảm công nhập liệu — nhưng bằng một con đường khác: **đặt điểm nhập liệu vào nơi người dùng đã ở sẵn cả ngày**, thay vì bắt họ mở app riêng. Đó là điểm mạnh thật sự, không phải chiêu trò.

### Vì sao không bê nguyên về được

| Thành phần | Xung đột với nguyên tắc nào |
|---|---|
| Tin nhắn qua Telegram | nội dung chi tiêu đi qua máy chủ bên thứ ba |
| Google Sheet làm database | toàn bộ dữ liệu tài chính nằm trên máy chủ Google |
| Quét email | phải trao quyền đọc hộp thư cho một dịch vụ chạy thường trực |

Đây **không phải phần mở rộng của mô hình hiện tại** — nó là một mô hình tin cậy khác. Nếu làm, phải làm như một chế độ riêng mà người dùng chủ động bật, nói rõ dữ liệu đi đâu, chứ không âm thầm gộp vào.

---

## 3. Phân tích từng ý tưởng

### 3.1 Quản lý theo 6 hũ — **✅ xong**

Phương pháp JARS: chia thu nhập theo tỷ lệ phần trăm thay vì đặt hạn mức tuyệt đối từng danh mục.

| Hũ | Tỷ lệ gợi ý | Mục đích |
|---|---|---|
| Thiết yếu | 55% | ăn ở, đi lại, hoá đơn |
| Tiết kiệm dài hạn | 10% | mục tiêu lớn |
| Giáo dục | 10% | học, sách, khoá học |
| Hưởng thụ | 10% | giải trí |
| Tự do tài chính | 10% | đầu tư, không tiêu |
| Cho đi | 5% | biếu tặng, từ thiện |

**Chạy hoàn toàn offline. Không xung đột nguyên tắc nào.**

Việc phải làm: mô hình ngân sách hiện tại là *hạn mức tuyệt đối theo từng danh mục theo tháng*. Sáu hũ cần thêm khái niệm **nhóm danh mục** và **hạn mức theo tỷ lệ thu nhập**, tức hạn mức tự đổi theo tháng nhiều tháng ít. Đây là thay đổi lược đồ dữ liệu, không phải chỉ thêm màn hình.

Đáng làm vì nó **giữ số liệu có nghĩa khi người dùng lười**: không cần chỉnh hạn mức mỗi tháng.

### 3.2 Quét email giao dịch ngân hàng — **nên làm, nhưng theo cách khác hẳn**

Giá trị thì rõ: đây là nguồn dữ liệu đầy đủ nhất cho thanh toán không tiền mặt, và hoàn toàn không tốn công nhập.

Nhưng cách của bot — một dịch vụ chạy thường trực có quyền đọc hộp thư — là thứ nặng nề nhất về quyền riêng tư trong cả danh sách.

**Phương án giữ được nguyên tắc:** một công cụ IMAP chạy **trên chính máy của người dùng** (một script Node trong repo này), đọc hộp thư qua IMAP, lọc email ngân hàng, xuất ra CSV rồi nhập vào app bằng đường nhập sao kê đã có.

| | Bot thường trực | Công cụ chạy tại máy |
|---|---|---|
| Ai giữ mật khẩu email | dịch vụ bên thứ ba | chỉ máy bạn |
| Dữ liệu đi đâu | qua máy chủ | không đi đâu |
| Cần máy chủ | có | không |
| Tự động hoàn toàn | có | phải chạy tay hoặc hẹn giờ |

Đổi lại sự tiện: phải tự chạy. Với người dùng cá nhân thì một lần mỗi tuần là đủ, và nó dùng lại toàn bộ bộ đọc sao kê đã viết xong.

### 3.3 Bot Telegram làm kênh nhập liệu — **cân nhắc, không vội**

Nếu làm thì có ba mức, khác nhau hoàn toàn về đánh đổi:

**Mức A — bot chỉ bắt, không giữ.** Nhận tin nhắn/voice, tách ra giao dịch, gửi lại một liên kết để app trên máy nuốt vào. Bot không có database. Telegram vẫn thấy nội dung tin nhắn, nhưng **không tồn tại kho dữ liệu chi tiêu nào ngoài máy bạn**.

**Mức B — bot có kho riêng.** Tiện nhất, dùng được nhiều thiết bị, nhưng từ bỏ lời hứa dữ liệu không rời máy. Nếu làm thì phải là chế độ tách bạch, người dùng tự bật, nói rõ ràng.

**Mức C — người dùng tự dựng bot của mình.** Giữ được quyền kiểm soát nhưng không còn là "trên máy". Hợp với người rành kỹ thuật, không hợp số đông.

Khuyến nghị: **nếu làm thì làm mức A**, và chỉ sau khi phần offline đã hoàn chỉnh.

Lưu ý: phần nhận diện giọng nói của bot gửi âm thanh lên dịch vụ AI. XAXI đã có giọng nói **chạy ngay trên máy** — về mặt riêng tư là tốt hơn, nên không có lý do đổi sang cách của bot.

### 3.4 Mini App trong Telegram — **chưa cần bàn**

Là kênh phân phối, không phải tính năng. Chỉ có nghĩa nếu đã chọn mức B ở trên.

### 3.5 Google Sheet làm database — **không làm**

Không giải quyết được vấn đề nào trong bộ lọc, mà để dữ liệu tài chính nằm trần trên bảng tính. Đồng bộ thật sự làm theo §3.6.

### 3.6 Đồng bộ đa thiết bị — **là mục tiêu, và có một việc phải làm NGAY**

Đồng bộ không mâu thuẫn với nguyên tắc riêng tư, **nếu máy chủ không bao giờ đọc được nội dung**. Cách duy nhất bảo đảm điều đó là mã hoá đầu-cuối: khoá nằm trên thiết bị, máy chủ chỉ giữ những khối byte vô nghĩa.

#### Việc phải làm ngay: đổi khoá chính sang UUID

Hiện tại mọi bảng dùng `++id` tự tăng. Hai thiết bị cùng ghi một giao dịch sẽ **cùng sinh ra id = 5** — trùng khoá, không thể hợp nhất. Không có cách sửa nào sạch sau khi người dùng đã có dữ liệu thật.

Đổi sang UUID **bây giờ**, lúc chưa ai dùng, gần như không tốn gì. Để sau thì phải viết cả tầng chuyển đổi và ánh xạ id cũ–mới, và mọi bản sao lưu cũ đều thành vấn đề.

Cùng lúc đó, mỗi bản ghi cần thêm ba trường:

| Trường | Dùng làm gì |
|---|---|
| `updatedAt` | biết bản nào mới hơn khi hai máy cùng sửa |
| `deletedAt` | **bia mộ** — xoá mà không ghi lại thì máy kia sẽ đồng bộ ngược nó về |
| `deviceId` | truy vết nguồn gốc, và phá thế hoà khi `updatedAt` trùng nhau |

Đây là thay đổi lược đồ thuần tuý, làm được độc lập với việc bao giờ mới bật đồng bộ.

#### Chiến lược hợp nhất

Dữ liệu chi tiêu cá nhân gần như chỉ có thêm mới, hiếm khi hai máy sửa cùng một bản ghi cùng lúc. Nên **hợp nhất theo từng bản ghi, bản mới hơn thắng** là đủ — không cần CRDT phức tạp.

Riêng ba chỗ cần xử lý riêng vì cộng dồn chứ không ghi đè:

- **Số dư ví** vốn được suy ra từ giao dịch, nên tự đúng sau khi hợp nhất
- **Bút toán đối soát** phải gắn với thiết bị sinh ra nó, không thì hai máy cùng đối soát sẽ bù hai lần
- **Đánh dấu ngày không chi tiêu** là tập hợp — hợp nhất bằng phép hợp, không phải ghi đè

#### Chỗ để dữ liệu — ba lựa chọn

| | Máy chủ tự dựng | Kho lưu trữ có sẵn | Thư mục app trên Drive của người dùng |
|---|---|---|---|
| Chi phí hạ tầng | có, và phải duy trì | theo mức dùng | **không** |
| Ai trả tiền | bạn | bạn | người dùng, bằng dung lượng sẵn có |
| Máy chủ đọc được gì | chỉ khối mã hoá | chỉ khối mã hoá | chỉ khối mã hoá |
| Cần tài khoản riêng | có | có | không, dùng tài khoản sẵn có |
| Hợp với quy mô | mọi quy mô | mọi quy mô | cá nhân |

Nghiêng về **thư mục app trên Drive của chính người dùng**: không phải dựng máy chủ, không phải giữ tài khoản của ai, không phải chịu trách nhiệm pháp lý với dữ liệu tài chính người khác. Dữ liệu đã mã hoá nên Google cũng chỉ thấy khối byte.

#### Quản lý khoá — chỗ dễ làm hỏng nhất

Khoá sinh từ một cụm mật khẩu người dùng đặt, qua hàm dẫn xuất chậm (PBKDF2 hoặc Argon2id), mã hoá bằng AES-GCM của WebCrypto — có sẵn trong trình duyệt, không cần thư viện.

**Mất cụm mật khẩu là mất sạch dữ liệu.** Không có cửa sau, không khôi phục được. Phải nói thẳng điều này với người dùng lúc bật, và bắt buộc xuất một bản sao lưu trước khi bật.

Thiết bị thứ hai nhập cùng cụm mật khẩu là đọc được — không cần đăng nhập, không cần máy chủ xác thực.

#### Việc chưa quyết

- Có cho nhiều người dùng chung một ví không (vợ chồng chung chi tiêu)? Điều này đổi hẳn mô hình khoá.
- Đồng bộ tự động hay bấm nút? Tự động tốn pin và dễ gây bất ngờ; bấm nút thì lại quên.

---

## 4. Thứ tự đề xuất

| # | Việc | Phá nguyên tắc nào không | Ghi chú |
|---|---|---|---|
| ~~0a~~ | ~~Xin lưu trữ bền vững~~ | — | **xong** — kèm phát hiện rằng bản Android vốn đã an toàn, xem §6.1.B |
| ~~0b~~ | ~~Chuyển tiền giữa ví~~ | — | **xong** — kiểm chứng trên máy: tổng chi không đổi sau khi chuyển 2tr |
| ~~0c~~ | ~~Đổi khoá chính sang UUID~~ | — | **xong** — di trú 227 giao dịch thật trên A50s, số liệu y hệt trước sau |
| 1 | Thử OCR và giọng nói bằng phần cứng thật | không | còn lại: giọng người thật vào micro, và một biên lai giấy thật |
| ~~2~~ | ~~Hoàn thiện giao diện~~ | — | **xong** — xem `docs/he-thong-thiet-ke.md` |
| ~~3~~ | ~~**Sáu hũ**~~ | — | **xong** — xem §10 |
| 4 | **Công cụ IMAP chạy tại máy** | không | dùng lại bộ đọc sao kê đã có |
| 5 | Rung phản hồi, icon vector | không | đánh bóng |
| 6 | Bot Telegram mức A | có, nhưng có kiểm soát | chỉ sau khi 1–5 xong |
| 7 | **Đồng bộ đa thiết bị, mã hoá đầu-cuối** | không, nếu làm đúng | mục tiêu đã chốt — xem §3.6 |


---

## 6. Rút ra từ tài liệu tham khảo

Nguồn: `docs/mo-ta.md` (CapMoney) và `docs/template/url.md` (ExpenseOwl, MoneyMatter, MoneyWallet, MMAS).

### 6.1 Ba lỗi thật trong XAXI mà tài liệu tham khảo làm lộ ra

Đây không phải "tính năng còn thiếu" — là chỗ app đang **sai** hoặc **có nguy cơ mất dữ liệu**.

#### A. Chuyển tiền giữa ví — **đã sửa**

CapMoney có "chuyển tiền giữa tài khoản bằng cặp giao dịch liên kết". XAXI không có gì cả.

Hậu quả: rút 2 triệu từ ngân hàng ra tiền mặt, người dùng buộc phải ghi thành một khoản **chi** ở ví ngân hàng và một khoản **thu** ở ví tiền mặt. Số dư từng ví thì đúng, nhưng:

- tổng chi tháng đó **phồng lên 2 triệu** dù không tiêu đồng nào
- tổng thu cũng phồng tương ứng
- phân bổ theo danh mục bị bẩn
- câu hỏi "tháng này chi bao nhiêu" trả lời **sai**

Đây là lỗi tính toán, không phải thiếu tiện nghi.

Cách sửa: một lần chuyển được ghi thành **cặp bản ghi liên kết** cùng mang `transferId` — một bản kiểu `expense` ở ví nguồn, một bản kiểu `income` ở ví đích. Nhờ vậy phép tính số dư từng ví không phải đổi gì, còn `transferId` là thứ báo cho mọi phép tính thu/chi biết mà loại chúng ra.

Kiểm chứng trên A50s: chuyển 2.000.000₫ giữa hai ví, tổng chi tháng giữ nguyên `14.839.000₫` trước và sau, số dư hai ví đổi đúng chiều.

#### B. Lưu trữ bền vững — **đã làm, nhưng kết luận ban đầu của tôi sai**

Nhận định đầu tiên là "rủi ro nặng nhất, có thể mất sạch dữ liệu ở mọi nền tảng". Đo trên máy thật thì **không đúng với bản Android**:

| | |
|---|---|
| IndexedDB nằm ở | `/data/data/com.mittohoa.xaxi_wallet/app_webview/Default/IndexedDB` |
| Đó là vùng | **app data**, không phải `cache/` |
| Android dọn dung lượng xoá | `cache/` — không đụng app data |

`navigator.storage.persist()` trả `false` trong WebView, nhưng **không phải vì dữ liệu bấp bênh** — mà vì Chromium cấp chế độ bền vững dựa trên tín hiệu "trang đã được cài đặt", thứ không tồn tại với một origin trong WebView. Trên bản đóng gói, dữ liệu vốn đã nằm trong vùng riêng của ứng dụng.

**Rủi ro thật chỉ có ở bản web.** Trình duyệt được phép xoá kho best-effort khi máy thiếu dung lượng; Chromium thường chỉ cấp bền vững sau khi người dùng thêm app vào màn hình chính.

Đã làm: `src/lib/storage.ts` phân biệt bốn mức (`app-private` / `persisted` / `best-effort` / `unknown`), nói đúng sự thật theo từng nền tảng thay vì doạ chung một câu, và chỉ mời xin ở nơi việc xin có nghĩa.

Bài học ghi lại: **đo trước khi báo động.** Suýt nữa thì hiện cảnh báo đỏ cho người dùng Android về một rủi ro không tồn tại.

#### C. Bản web không thật sự chạy offline

CapMoney có "PWA, cache offline". XAXI có tệp manifest nhưng **không đăng ký service worker nào** — mở bản GitHub Pages lúc mất mạng là trang trắng.

Nghĩa là lời "local-first" hiện chỉ đúng với bản Android. Cần một service worker tối thiểu cache vỏ app.

### 6.2 Ý tưởng mạnh nên lấy

#### Giữ lại ảnh biên lai — **đáng giá nhất trong cả danh sách**

CapMoney lưu ảnh capture thật của giao dịch và có cả **lịch ảnh** để xem lại theo ngày.

XAXI hiện đọc chữ từ ảnh rồi **vứt ảnh đi**. Giữ lại một bản nén sẽ mở ra:

- **Chụp là xong** — không cần gõ gì, phân loại sau lúc rảnh. Đây đúng là bộ lọc "giảm công nhập liệu" ở mức mạnh nhất.
- Đối chiếu lại được khi nghi ngờ số liệu, thay vì phải tin vào OCR
- Ảnh vẫn nằm trên máy, không phá nguyên tắc nào

Cái giá: dung lượng. Cần nén mạnh, và cần một trang hiển thị dung lượng đang dùng — CapMoney làm đúng vậy.

#### Quy tắc phân loại do người dùng tự đặt

XAXI có từ khoá dựng sẵn và bộ phân loại tự học, nhưng người dùng **không can thiệp được** khi máy đoán sai. CapMoney cho đặt quy tắc theo từ khoá. Rẻ, và trả lại quyền kiểm soát.

#### Chống trùng khi ghi nhanh

XAXI mới chống trùng ở đường nhập sao kê. CapMoney chống trùng cả ở đường OCR. Nên mở rộng: cùng số tiền, cùng ngày, ghi chú giống nhau trong vòng vài phút thì hỏi lại.

### 6.3 Ghi nhận từ các dự án mã nguồn mở

| Dự án | Điều đáng học |
|---|---|
| **ExpenseOwl** | Cố tình **không làm** ngân sách, tài khoản, tìm kiếm. Một lời nhắc rằng thêm tính năng luôn có giá, và "theo dõi" khác "lập kế hoạch" |
| **MoneyMatter** | Quy tắc tự động hoá · người nhận (payee) · tách hoá đơn · hoàn tiền · **máy chủ MCP cho AI truy vấn dữ liệu** |
| **MoneyWallet** | Android thuần, nhiều biến thể build (có/không phụ thuộc dịch vụ Google) — mô hình đáng tham khảo nếu muốn lên F-Droid |
| **MMAS** | Flutter, đa nền tảng — hướng khác với Capacitor nhưng cùng bài toán |

Riêng ý **máy chủ MCP** của MoneyMatter đáng suy nghĩ: cho một trợ lý AI truy vấn dữ liệu chi tiêu. Nếu làm thì phải là **MCP chạy cục bộ**, đọc từ bản sao lưu trên máy, chứ không phải máy chủ từ xa — nếu không thì lại rơi vào đúng cái bẫy đã phân tích ở §2.

### 6.4 Chưa rõ, cần bạn xác nhận

- **CapMoney là app của bạn hay là tham chiếu bên ngoài?** Nếu là của bạn thì câu hỏi thật sự không phải "lấy ý gì" mà là **XAXI và CapMoney khác nhau ở đâu** — hai app cùng giải một bài toán thì nên có lý do tồn tại riêng, không thì nên gộp.
- **Đa tiền tệ** (MoneyMatter có, CapMoney không): có cần không? Nếu chỉ dùng VND thì bỏ qua, vì nó kéo theo tỷ giá và quy đổi khá nặng.

---

## 5. Câu hỏi còn treo

- **Sáu hũ có thay thế ngân sách theo danh mục, hay chạy song song?** Hai mô hình cùng lúc dễ làm rối. Nghiêng về: sáu hũ là *lớp trên*, mỗi danh mục thuộc về một hũ.
- **Thu nhập tính theo tháng nào?** Lương về ngày 5 thì hũ của tháng đó tính từ mốc nào — đã có thiết lập "ngày bắt đầu kỳ", nên dùng lại.
- **Nếu chi vượt một hũ thì sao?** Chặn, cảnh báo, hay tự mượn từ hũ khác? Chặn thì trái tinh thần "app không phán xét người dùng".
- **Ngân hàng nào gửi email giao dịch?** Cần biết cụ thể để viết bộ lọc IMAP — mỗi ngân hàng một định dạng.
- **Đồng bộ cho một người nhiều máy, hay nhiều người chung một ví?** Quyết định này đổi hẳn mô hình khoá, nên cần chốt trước khi viết dòng code đồng bộ đầu tiên.

---

## 7. Ý tưởng tính năng rút từ 27 thiết kế tham khảo

Nguồn: `docs/template/UI/`. Mỗi ý dưới đây đã đi qua bộ lọc ở §0 — *giảm công
nhập liệu, hoặc giữ số liệu đúng khi người dùng lười*. Ý nào chỉ "trông hay" mà
không qua được bộ lọc đều nằm ở mục cuối.

Xếp theo **giá trị chia cho công sức**, cao nhất trước.

### 7.1 Khoản sắp tới — **✅ xong**

Bộ tham khảo nào cũng có khối "Upcoming Payments". XAXI **đã có sẵn dữ liệu**:
bảng `recurring` với `nextDate`. Chỉ thiếu việc hiện ba khoản gần nhất lên màn
hình chính.

Không đòi nhập thêm một chữ nào, và nó trả lời đúng câu hỏi người ta thật sự
hỏi trước khi tiêu: *"từ giờ tới cuối tháng còn phải trả những gì?"*

Công: một khối nhỏ trên Console. Dữ liệu và phép tính đã có.

### 7.2 Dự báo cuối kỳ — **✅ xong**

*"Theo nhịp hiện tại, cuối tháng bạn sẽ chi khoảng 16,8 triệu."*

Thuần tính toán: nhịp chi đã có (`paceRatio` trong Budgets), cộng các khoản
định kỳ chưa tới hạn trong kỳ. Không nhập gì thêm.

Đây là thứ đổi được hành vi: biết trước ngày 12 thì còn kịp, biết ngày 30 thì
chỉ còn hối tiếc.

**Điều kiện:** phải nói rõ là *ước tính*, và không dự báo khi độ phủ dữ liệu
dưới một ngưỡng — dự báo từ dữ liệu thủng là bịa số.

### 7.3 Bắt khoản bất thường ngay lúc nhập — **✅ xong**

Gõ `cà phê 350k`, app hỏi lại: *"Cà phê thường 35.000₫. Có phải bạn định gõ
35k?"*

Bộ phân loại Naive Bayes đã học phân phối số tiền theo danh mục rồi; chỉ cần
đọc thêm độ lệch chuẩn. Bắt lỗi thừa số 0 — loại lỗi nhập liệu phổ biến nhất
và khó phát hiện nhất về sau.

Đúng tinh thần *giữ số liệu đúng*: rẻ nhất là chặn sai ngay lúc nhập.

### 7.4 Nhân bản khoản gần nhất — **✅ xong**

Nhấn giữ một dòng trong danh sách → "Ghi lại y hệt, hôm nay". Một chạm.

Đã có `suggestShortcuts` gợi ý theo tần suất; cái này là đường tắt trực tiếp
cho trường hợp "hôm nay lại đúng như hôm qua".

### 7.5 Tiện ích màn hình chính Android — ★★ đáng nhưng tốn công

Công cụ giảm chi phí nhập liệu mạnh nhất còn lại: **ghi được mà không cần mở
app**. Một ô hiện "chi hôm nay" cộng một nút mở thẳng ô nhập.

Cần viết native thật (Glance hoặc RemoteViews), và widget phải đọc được dữ liệu
đang nằm trong IndexedDB của WebView — đây là chỗ khó, có thể phải ghi thêm một
bản tóm tắt nhỏ ra `SharedPreferences` mỗi lần đổi dữ liệu.

Không xin thêm quyền nào.

### 7.6 Chi cố định và chi biến đổi — **✅ xong**

*"68% chi tiêu tháng này là khoản cố định."*

Phân loại đã có sẵn trong dữ liệu: `source === 'recurring'` so với phần còn
lại. Một dòng trong Báo cáo, không nhập gì thêm.

Con số này đổi cách người ta nghĩ: phần cố định không cắt được bằng ý chí, nên
biết tỷ lệ mới biết còn bao nhiêu chỗ để xoay.

### 7.7 Mục tiêu tiết kiệm — **✅ xong**

Khối "Savings Goals" xuất hiện dày đặc trong bộ tham khảo. Nó tạo lý do để tiếp
tục ghi chép — đúng vấn đề gốc của app.

Nhưng nó **đòi nhập liệu** (đặt mục tiêu, gán tiến độ), nên chỉ đáng làm nếu
tiến độ **tự tính** từ số dư ví thay vì bắt người dùng cập nhật tay. Gán một ví
cho một mục tiêu, tiến độ chạy theo số dư ví đó.

### 7.8 So sánh kỳ trước ở mọi con số — **✅ xong**

Đã làm cho hai ô Thu/Chi trên màn hình chính. Còn thiếu: mỗi danh mục trong
Báo cáo.

Lưu ý đã cài sẵn trong `comparableRange`: phải so **cùng số ngày đã trôi qua**.
So tháng mới đi mười hai ngày với cả tháng trước thì tháng nào cũng ra "giảm
mạnh" — một con số luôn sai theo cùng một hướng dạy người dùng bỏ qua chỗ đó.

### 7.9 Ngày nào trong tuần tiêu nhiều nhất — **✅ xong**

Thuần suy ra từ dữ liệu có sẵn. Thường ra kết quả người dùng không ngờ (cuối
tuần, hoặc đúng ngày nhận lương).

---

### Đã cân nhắc và bỏ

| Ý | Vì sao bỏ |
|---|---|
| Thanh tab dưới đáy | Đã bỏ có chủ ý — "ô nhập là toàn bộ app" |
| Chuyển tiền cho người khác, ảnh đại diện | Không có tài khoản, không có mạng xã hội |
| Nối ngân hàng, hiện thẻ VISA | Trái nguyên tắc không hỏi thông tin ngân hàng |
| Trợ lý AI dạng chat toàn màn hình | Ô nhập đã trả lời câu hỏi; thêm màn hình là thêm bước |
| Gói trả phí, "Get Pro" | Không có |
| Theo dõi đầu tư, danh mục cổ phiếu | Bài toán khác hẳn, kéo theo dữ liệu thời gian thực từ mạng |
| Thông báo thường trú để ghi nhanh | Hiệu quả, nhưng phiền — trái với "app không làm phiền người dùng" |
,---,,## 8. Ghi chú khi làm 7.1–7.3,,Ba tính năng này đều nói với người dùng một con số mà họ không tự tính được.,Nên phần khó không phải là tính ra số, mà là **biết khi nào phải im lặng** —,một con số sai trong app tài chính tệ hơn là không có con số nào.,,**Dự báo im lặng khi:** chưa đủ năm ngày trong kỳ · còn dưới ba ngày là hết kỳ,(lúc đó dự báo gần bằng số đã chi, đúng nhưng vô dụng, mà một ô vô dụng chiếm,chỗ thì lần sau người dùng thôi nhìn vào đó) · độ phủ dữ liệu dưới 50% · chưa,ghi khoản nào.,,**Dự báo tách chi định kỳ khỏi chi biến đổi trước khi suy ra nhịp.** Không tách,thì tiền nhà ghi ngày mùng 3 bị nhân lên cho cả tháng và dự báo phóng đại gấp,mấy lần.,,**Cảnh báo số tiền có ba điều kiện cùng lúc**, trong đó điều kiện thứ ba quan,trọng nhất: số tiền phải lớn hơn **mọi khoản từng ghi** trong danh mục đó thêm,một nửa nữa. Không có nó thì một bữa nhậu 500k trong danh mục Ăn uống thường,50k sẽ bị hỏi lại mỗi lần — và một cảnh báo hay báo nhầm thì chỉ vài lần là bị,bấm bỏ qua theo phản xạ, đúng lúc nó báo đúng cũng bị bỏ qua nốt.,,Đo trên dữ liệu mẫu thật (141 khoản Ăn uống, trung vị 73k, lớn nhất 118k):,,| Gõ vào | Kết quả |,|---|---|,| `cà phê 73k` | im lặng |,| `cà phê 150k` | im lặng — gấp đôi vẫn là bữa đắt, không phải lỗi |,| `cà phê 350k` | im lặng — gấp 4,8 lần, dưới ngưỡng 5 |,| `cà phê 730k` | *"Nghi thừa một số 0 — danh mục này thường quanh 73.000 ₫"* |,| `xăng 2tr` | *"Lớn gấp 42 lần mức thường gặp (48.000 ₫)"* |,| `tiền nhà 4tr5` | im lặng — đúng mức thường của danh mục đó |,,Cảnh báo **không chặn**. Nhấn Enter là vẫn ghi. App hỏi lại, không phán xét.,,---,,## 9. Ghi chú khi làm 7.4, 7.6, 7.8, 7.9,,**Nhân bản bằng nhấn giữ.** Ghi ngay chứ không hỏi lại — hỏi lại biến một chạm,thành ba chạm, mà ba chạm thì đã không còn là đường tắt nữa. Cái đỡ là nút,"Hoàn tác" trên thông báo, nên thông báo giờ nhận được một việc kèm theo.,,Không chép `transferId`. Chép một vế của lần chuyển tiền sẽ tạo ra nửa cặp liên,kết: số dư hai ví lệch nhau ngay, mà mọi phép tính thu/chi vẫn loại nó ra nên,không con số nào lộ ra sai. Đó là kiểu hỏng im lặng tệ nhất.,,**Nhãn so sánh có vùng chết 5%.** Dưới mức đó là dao động thường ngày, không,phải tín hiệu. Trong danh sách dài thì im hẳn thay vì hiện "≈ như kỳ trước" —,một nhãn không nói gì vẫn chiếm chỗ và vẫn bắt mắt phải đọc.,,**Thứ tiêu nhiều nhất tính trên 90 ngày, không phải một tháng.** Một tháng chỉ,có bốn lần mỗi thứ; một bữa nhậu là đủ làm lệch kết luận. Và chỉ nói khi thứ đó,nhô lên trên 30% so với mức trung bình — tiêu đều thì không có gì để nói.,,Đọc ngày bằng giờ UTC chứ không phải giờ máy: chuỗi `YYYY-MM-DD` không mang múi,giờ, và `new Date('2026-09-29')` ở múi giờ âm sẽ lùi về hôm trước — đủ để cả,kết luận lệch đi một thứ.,,**Hai lỗi có sẵn lộ ra khi làm:**,,- Thông báo bị bó vào nửa màn hình. `left: 50%` làm khối chứa chỉ còn một nửa bề,  ngang, nên thông báo dài xuống dòng vô cớ dù còn thừa chỗ; phép `transform`,  chỉ dời nó về giữa khi VẼ, không trả lại phần bề ngang đã mất lúc dàn trang.,- Nút trên thông báo không thể dùng chữ màu: nền thông báo là `--text-primary`,  nên nó đảo màu theo chế độ sáng/tối, và chữ màu đặt lên đó chắc chắn hỏng,  tương phản ở một trong hai. Phải là viên thuốc mang nền riêng.,,---,,## 10. Sáu hũ — bốn quyết định và lý do,,Bốn câu hỏi treo ở §5 giờ đã có câu trả lời, và chúng được ghi thẳng vào mã.,,### Hũ là lớp TRÊN của danh mục, không thay thế,,Mỗi danh mục thuộc nhiều nhất một hũ. Ngân sách theo danh mục vẫn chạy song,song ở tab bên cạnh cho ai muốn chi tiết hơn. Màn hình mở mặc định ở sáu hũ vì,đó là cách nhìn trả lời được câu hỏi lớn — *tháng này mình đang phân bổ thế,nào* — còn hạn mức từng danh mục là lớp chi tiết.,,### Mọi hũ đều là khoản ĐƯỢC PHÉP TIÊU, kể cả hũ tiết kiệm,,Phương pháp gốc bảo chuyển tiền thật sang từng hũ. Làm vậy đòi người dùng thao,tác thêm mỗi tháng — đúng thứ app này sinh ra để cắt.,,Ở đây hũ tiết kiệm là khoản **không được tiêu**, và "còn nguyên" nghĩa là đã,giữ lại được. Màn hình nói thẳng: *"✓ giữ được 900.000 ₫"*. Không đòi nhập gì,thêm, và con số vẫn đúng.,,### Vượt hũ thì cảnh báo, không chặn,,App không phán xét người dùng. Chặn một khoản chi có thật chỉ khiến người ta,ngừng ghi, và dữ liệu thủng thì mọi con số khác cũng hỏng theo.,,### Không bao giờ hiện hạn mức 0₫ chỉ vì lương chưa về,,Đây là chỗ dễ làm hỏng nhất. Nửa đầu tháng, trước khi lương về, thu nhập của kỳ,bằng 0 — lấy thẳng con số đó thì mọi hũ hiện hạn mức 0₫, tức tính năng chết,đúng nửa tháng, mỗi tháng.,,Nên khi kỳ này chưa có thu nhập, nền lấy **trung vị của tối đa ba kỳ gần nhất**,có thu nhập, và màn hình hiện dấu `≈` cùng câu giải thích. Trung vị chứ không,phải trung bình: một tháng có thưởng Tết sẽ kéo trung bình lên và làm hạn mức,mọi hũ phồng theo suốt mấy tháng sau.,,### Ánh xạ mặc định,,| Hũ | Tỷ lệ | Danh mục mặc định |,|---|---|---|,| Thiết yếu | 55% | Ăn uống · Đi lại · Nhà cửa · Hoá đơn · Sức khoẻ |,| Giáo dục | 10% | Giáo dục |,| Hưởng thụ | 10% | Mua sắm · Giải trí |,| Tiết kiệm dài hạn | 10% | — (để dành) |,| Tự do tài chính | 10% | — (để dành) |,| Cho đi | 5% | — (để dành) |,,Tỷ lệ sửa được từng hũ, lưu ngay khi gõ. Tổng **không bị ép** phải bằng 100 —,người dùng có thể cố ý để 90 và giữ 10 ngoài hệ thống; màn hình chỉ nói ra con,số để họ biết mình đang ở đâu.,,---,,## 11. Mục tiêu tiết kiệm — điều kiện đã đặt ra và cách giữ nó,,Ở §7.7 điều kiện là: **chỉ đáng làm nếu tiến độ tự tính**, không bắt người dùng,cập nhật tay. Điều kiện đó được giữ.,,Mỗi mục tiêu gắn với **một ví**, và tiến độ chính là số dư ví đó. Người dùng,chuyển tiền vào ví — việc họ vốn đã làm — là tiến độ tự chạy. Sau khi đặt xong,,mục tiêu không đòi thêm một thao tác nào nữa.,,Cách thông thường là lưu một con số "đã góp được" riêng. Làm vậy là có hai nguồn,sự thật phải tự giữ khớp nhau bằng tay, và người quên ghi chi tiêu thì cũng quên,cập nhật tiến độ — một thanh tiến độ đứng yên ba tháng còn tệ hơn không có, vì,nó trông như thật.,,### Ba con số suy ra, không nhập,,| Con số | Suy từ |,|---|---|,| Đã có | số dư ví |,| Nhịp góp mỗi tháng | dòng tiền ròng vào ví, ba kỳ **đã hoàn tất** gần nhất |,| Dự kiến đạt | phần còn thiếu chia cho nhịp góp |,,Kỳ đang chạy dở **không** được tính vào nhịp: kỳ mới đi được ba ngày sẽ kéo,trung bình xuống và làm ngày dự kiến đạt lùi ra hàng năm.,,Ở đây chuyển tiền giữa ví **có** được tính — khác mọi phép tính thu/chi khác,trong app. Chuyển 2 triệu từ ví chính sang ví tiết kiệm chính là hành động tiết,kiệm; loại nó ra thì mọi mục tiêu sẽ mãi mãi đứng ở 0.,,### Khi nào im lặng,,Không dự đoán ngày đạt khi chưa có kỳ nào hoàn tất để đo, hoặc khi nhịp góp,đang bằng 0 hoặc âm. Bịa ra một ngày đạt trong trường hợp đó là nói dối về,chính tiền của người dùng.,,### Hai chỗ chặn lỗi ngay trong giao diện,,- **Tạo ví mới ngay tại chỗ.** Không có nó thì người dùng gặp ngõ cụt: muốn đặt,  mục tiêu nhưng chưa có ví riêng, phải thoát ra Cài đặt tạo ví rồi quay lại —,  đủ để bỏ dở.,- **Ví đã có mục tiêu khác thì không chọn được nữa.** Hai mục tiêu cùng một ví,  sẽ hiện cùng một số dư; cả hai đều sai và không có gì báo.,