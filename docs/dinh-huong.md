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

### 3.1 Quản lý theo 6 hũ — **nên làm, ưu tiên cao**

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
| 0a | **Xin lưu trữ bền vững** | không | rủi ro mất sạch dữ liệu — xem §6.1.B, sửa rất rẻ |
| 0b | **Chuyển tiền giữa ví** | không | báo cáo đang sai — xem §6.1.A |
| 0c | **Đổi khoá chính sang UUID + thêm `updatedAt`/`deletedAt`/`deviceId`** | không | làm sớm rẻ, làm muộn rất đắt — xem §3.6 |
| 1 | Thử OCR và giọng nói bằng phần cứng thật | không | chưa xong, chặn việc khẳng định hai tính năng này chạy được |
| 2 | Hoàn thiện giao diện sau khi có tham chiếu | không | đang chờ ảnh chụp app khác |
| 3 | **Sáu hũ** | không | cần đổi lược đồ ngân sách |
| 4 | **Công cụ IMAP chạy tại máy** | không | dùng lại bộ đọc sao kê đã có |
| 5 | Rung phản hồi, icon vector | không | đánh bóng |
| 6 | Bot Telegram mức A | có, nhưng có kiểm soát | chỉ sau khi 1–5 xong |
| 7 | **Đồng bộ đa thiết bị, mã hoá đầu-cuối** | không, nếu làm đúng | mục tiêu đã chốt — xem §3.6 |


---

## 6. Rút ra từ tài liệu tham khảo

Nguồn: `docs/mo-ta.md` (CapMoney) và `docs/template/url.md` (ExpenseOwl, MoneyMatter, MoneyWallet, MMAS).

### 6.1 Ba lỗi thật trong XAXI mà tài liệu tham khảo làm lộ ra

Đây không phải "tính năng còn thiếu" — là chỗ app đang **sai** hoặc **có nguy cơ mất dữ liệu**.

#### A. Không có khái niệm chuyển tiền giữa ví — **báo cáo đang sai**

CapMoney có "chuyển tiền giữa tài khoản bằng cặp giao dịch liên kết". XAXI không có gì cả.

Hậu quả: rút 2 triệu từ ngân hàng ra tiền mặt, người dùng buộc phải ghi thành một khoản **chi** ở ví ngân hàng và một khoản **thu** ở ví tiền mặt. Số dư từng ví thì đúng, nhưng:

- tổng chi tháng đó **phồng lên 2 triệu** dù không tiêu đồng nào
- tổng thu cũng phồng tương ứng
- phân bổ theo danh mục bị bẩn
- câu hỏi "tháng này chi bao nhiêu" trả lời **sai**

Đây là lỗi tính toán, không phải thiếu tiện nghi. Cần thêm loại giao dịch thứ ba (`transfer`) với hai bản ghi liên kết bị **loại khỏi mọi phép tính thu/chi**.

#### B. Không xin lưu trữ bền vững — **có thể mất sạch dữ liệu**

CapMoney có "xin chế độ lưu trữ bền vững". XAXI chưa gọi `navigator.storage.persist()` lần nào.

IndexedDB ở chế độ mặc định là **"best-effort"**: trình duyệt và WebView được phép xoá nó khi máy thiếu dung lượng, **không báo trước, không hỏi**. Với một app mà toàn bộ lời hứa là "dữ liệu nằm trên máy bạn", đây là rủi ro nặng nhất trong cả danh sách.

Sửa rẻ: gọi `navigator.storage.persist()` lúc khởi động, và hiện trạng thái trong Cài đặt để người dùng biết dữ liệu của mình đang ở chế độ nào.

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
