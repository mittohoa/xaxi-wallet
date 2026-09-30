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

#### Hai câu hỏi này đã chốt

Cả hai đều đã trả lời, xem **§18**: không làm chế độ chung ví riêng, và đồng bộ
là **bấm nút** — kèm lời nhắc cho nửa "thì lại quên".

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
| ~~4~~ | ~~**Công cụ IMAP chạy tại máy**~~ | — | **xong** — xem §14 |
| ~~5~~ | ~~Rung phản hồi, icon vector~~ | — | **xong** — 23 hình vector, xem `docs/he-thong-thiet-ke.md` §10 |
| ~~6~~ | ~~**Bot Telegram mức A**~~ | — | **xong** — xem §15 |
| ~~7~~ | ~~**Đồng bộ đa thiết bị, mã hoá đầu-cuối**~~ | — | **xong** — xem §16 |


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

### 7.5 Tiện ích màn hình chính Android — **✅ xong**

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

---

## 8. Ghi chú khi làm 7.1–7.3

Ba tính năng này đều nói với người dùng một con số mà họ không tự tính được.
Nên phần khó không phải là tính ra số, mà là **biết khi nào phải im lặng** —
một con số sai trong app tài chính tệ hơn là không có con số nào.

**Dự báo im lặng khi:** chưa đủ năm ngày trong kỳ · còn dưới ba ngày là hết kỳ
(lúc đó dự báo gần bằng số đã chi, đúng nhưng vô dụng, mà một ô vô dụng chiếm
chỗ thì lần sau người dùng thôi nhìn vào đó) · độ phủ dữ liệu dưới 50% · chưa
ghi khoản nào.

**Dự báo tách chi định kỳ khỏi chi biến đổi trước khi suy ra nhịp.** Không tách
thì tiền nhà ghi ngày mùng 3 bị nhân lên cho cả tháng và dự báo phóng đại gấp
mấy lần.

**Cảnh báo số tiền có ba điều kiện cùng lúc**, trong đó điều kiện thứ ba quan
trọng nhất: số tiền phải lớn hơn **mọi khoản từng ghi** trong danh mục đó thêm
một nửa nữa. Không có nó thì một bữa nhậu 500k trong danh mục Ăn uống thường
50k sẽ bị hỏi lại mỗi lần — và một cảnh báo hay báo nhầm thì chỉ vài lần là bị
bấm bỏ qua theo phản xạ, đúng lúc nó báo đúng cũng bị bỏ qua nốt.

Đo trên dữ liệu mẫu thật (141 khoản Ăn uống, trung vị 73k, lớn nhất 118k):

| Gõ vào | Kết quả |
|---|---|
| `cà phê 73k` | im lặng |
| `cà phê 150k` | im lặng — gấp đôi vẫn là bữa đắt, không phải lỗi |
| `cà phê 350k` | im lặng — gấp 4,8 lần, dưới ngưỡng 5 |
| `cà phê 730k` | *"Nghi thừa một số 0 — danh mục này thường quanh 73.000 ₫"* |
| `xăng 2tr` | *"Lớn gấp 42 lần mức thường gặp (48.000 ₫)"* |
| `tiền nhà 4tr5` | im lặng — đúng mức thường của danh mục đó |

Cảnh báo **không chặn**. Nhấn Enter là vẫn ghi. App hỏi lại, không phán xét.

---

## 9. Ghi chú khi làm 7.4, 7.6, 7.8, 7.9

**Nhân bản bằng nhấn giữ.** Ghi ngay chứ không hỏi lại — hỏi lại biến một chạm
thành ba chạm, mà ba chạm thì đã không còn là đường tắt nữa. Cái đỡ là nút
"Hoàn tác" trên thông báo, nên thông báo giờ nhận được một việc kèm theo.

Không chép `transferId`. Chép một vế của lần chuyển tiền sẽ tạo ra nửa cặp liên
kết: số dư hai ví lệch nhau ngay, mà mọi phép tính thu/chi vẫn loại nó ra nên
không con số nào lộ ra sai. Đó là kiểu hỏng im lặng tệ nhất.

**Nhãn so sánh có vùng chết 5%.** Dưới mức đó là dao động thường ngày, không
phải tín hiệu. Trong danh sách dài thì im hẳn thay vì hiện "≈ như kỳ trước" —
một nhãn không nói gì vẫn chiếm chỗ và vẫn bắt mắt phải đọc.

**Thứ tiêu nhiều nhất tính trên 90 ngày, không phải một tháng.** Một tháng chỉ
có bốn lần mỗi thứ; một bữa nhậu là đủ làm lệch kết luận. Và chỉ nói khi thứ đó
nhô lên trên 30% so với mức trung bình — tiêu đều thì không có gì để nói.

Đọc ngày bằng giờ UTC chứ không phải giờ máy: chuỗi `YYYY-MM-DD` không mang múi
giờ, và `new Date('2026-09-29')` ở múi giờ âm sẽ lùi về hôm trước — đủ để cả
kết luận lệch đi một thứ.

**Hai lỗi có sẵn lộ ra khi làm:**

- Thông báo bị bó vào nửa màn hình. `left: 50%` làm khối chứa chỉ còn một nửa bề
  ngang, nên thông báo dài xuống dòng vô cớ dù còn thừa chỗ; phép `transform`
  chỉ dời nó về giữa khi VẼ, không trả lại phần bề ngang đã mất lúc dàn trang.
- Nút trên thông báo không thể dùng chữ màu: nền thông báo là `--text-primary`
  nên nó đảo màu theo chế độ sáng/tối, và chữ màu đặt lên đó chắc chắn hỏng
  tương phản ở một trong hai. Phải là viên thuốc mang nền riêng.

---

## 10. Sáu hũ — bốn quyết định và lý do

Bốn câu hỏi treo ở §5 giờ đã có câu trả lời, và chúng được ghi thẳng vào mã.

### Hũ là lớp TRÊN của danh mục, không thay thế

Mỗi danh mục thuộc nhiều nhất một hũ. Ngân sách theo danh mục vẫn chạy song
song ở tab bên cạnh cho ai muốn chi tiết hơn. Màn hình mở mặc định ở sáu hũ vì
đó là cách nhìn trả lời được câu hỏi lớn — *tháng này mình đang phân bổ thế
nào* — còn hạn mức từng danh mục là lớp chi tiết.

### Mọi hũ đều là khoản ĐƯỢC PHÉP TIÊU, kể cả hũ tiết kiệm

Phương pháp gốc bảo chuyển tiền thật sang từng hũ. Làm vậy đòi người dùng thao
tác thêm mỗi tháng — đúng thứ app này sinh ra để cắt.

Ở đây hũ tiết kiệm là khoản **không được tiêu**, và "còn nguyên" nghĩa là đã
giữ lại được. Màn hình nói thẳng: *"✓ giữ được 900.000 ₫"*. Không đòi nhập gì
thêm, và con số vẫn đúng.

### Vượt hũ thì cảnh báo, không chặn

App không phán xét người dùng. Chặn một khoản chi có thật chỉ khiến người ta
ngừng ghi, và dữ liệu thủng thì mọi con số khác cũng hỏng theo.

### Không bao giờ hiện hạn mức 0₫ chỉ vì lương chưa về

Đây là chỗ dễ làm hỏng nhất. Nửa đầu tháng, trước khi lương về, thu nhập của kỳ
bằng 0 — lấy thẳng con số đó thì mọi hũ hiện hạn mức 0₫, tức tính năng chết
đúng nửa tháng, mỗi tháng.

Nên khi kỳ này chưa có thu nhập, nền lấy **trung vị của tối đa ba kỳ gần nhất**
có thu nhập, và màn hình hiện dấu `≈` cùng câu giải thích. Trung vị chứ không
phải trung bình: một tháng có thưởng Tết sẽ kéo trung bình lên và làm hạn mức
mọi hũ phồng theo suốt mấy tháng sau.

### Ánh xạ mặc định

| Hũ | Tỷ lệ | Danh mục mặc định |
|---|---|---|
| Thiết yếu | 55% | Ăn uống · Đi lại · Nhà cửa · Hoá đơn · Sức khoẻ |
| Giáo dục | 10% | Giáo dục |
| Hưởng thụ | 10% | Mua sắm · Giải trí |
| Tiết kiệm dài hạn | 10% | — (để dành) |
| Tự do tài chính | 10% | — (để dành) |
| Cho đi | 5% | — (để dành) |

Tỷ lệ sửa được từng hũ, lưu ngay khi gõ. Tổng **không bị ép** phải bằng 100 —
người dùng có thể cố ý để 90 và giữ 10 ngoài hệ thống; màn hình chỉ nói ra con
số để họ biết mình đang ở đâu.

---

## 11. Mục tiêu tiết kiệm — điều kiện đã đặt ra và cách giữ nó

Ở §7.7 điều kiện là: **chỉ đáng làm nếu tiến độ tự tính**, không bắt người dùng
cập nhật tay. Điều kiện đó được giữ.

Mỗi mục tiêu gắn với **một ví**, và tiến độ chính là số dư ví đó. Người dùng
chuyển tiền vào ví — việc họ vốn đã làm — là tiến độ tự chạy. Sau khi đặt xong

mục tiêu không đòi thêm một thao tác nào nữa.

Cách thông thường là lưu một con số "đã góp được" riêng. Làm vậy là có hai nguồn
sự thật phải tự giữ khớp nhau bằng tay, và người quên ghi chi tiêu thì cũng quên
cập nhật tiến độ — một thanh tiến độ đứng yên ba tháng còn tệ hơn không có, vì
nó trông như thật.

### Ba con số suy ra, không nhập

| Con số | Suy từ |
|---|---|
| Đã có | số dư ví |
| Nhịp góp mỗi tháng | dòng tiền ròng vào ví, ba kỳ **đã hoàn tất** gần nhất |
| Dự kiến đạt | phần còn thiếu chia cho nhịp góp |

Kỳ đang chạy dở **không** được tính vào nhịp: kỳ mới đi được ba ngày sẽ kéo
trung bình xuống và làm ngày dự kiến đạt lùi ra hàng năm.

Ở đây chuyển tiền giữa ví **có** được tính — khác mọi phép tính thu/chi khác
trong app. Chuyển 2 triệu từ ví chính sang ví tiết kiệm chính là hành động tiết
kiệm; loại nó ra thì mọi mục tiêu sẽ mãi mãi đứng ở 0.

### Khi nào im lặng

Không dự đoán ngày đạt khi chưa có kỳ nào hoàn tất để đo, hoặc khi nhịp góp
đang bằng 0 hoặc âm. Bịa ra một ngày đạt trong trường hợp đó là nói dối về
chính tiền của người dùng.

### Hai chỗ chặn lỗi ngay trong giao diện

- **Tạo ví mới ngay tại chỗ.** Không có nó thì người dùng gặp ngõ cụt: muốn đặt
  mục tiêu nhưng chưa có ví riêng, phải thoát ra Cài đặt tạo ví rồi quay lại —
  đủ để bỏ dở.
- **Ví đã có mục tiêu khác thì không chọn được nữa.** Hai mục tiêu cùng một ví
  sẽ hiện cùng một số dư; cả hai đều sai và không có gì báo.

---

## 12. Tiện ích màn hình chính — và điều nó KHÔNG làm được

### Ràng buộc thật

Dữ liệu của app nằm trong IndexedDB của WebView, và **không một đoạn mã native
nào đọc được nó**. Widget chạy trong tiến trình của launcher, cách WebView hai
lớp, nên nó không bao giờ được phép "hỏi" app xem hôm nay tiêu bao nhiêu.

Cách giải: lớp web **ghi sẵn** một bản tóm tắt rất nhỏ ra SharedPreferences mỗi
lần dữ liệu đổi; widget chỉ đọc lại. Một nơi ghi, một nơi đọc — bản tóm tắt có
thể cũ vài giây nhưng không bao giờ mâu thuẫn.

Chỉ gửi **chuỗi đã định dạng**. Định dạng tiền tệ (locale, đơn vị, dấu phân
cách) sống ở lớp web; làm lại ở lớp native là có hai chỗ cùng định dạng một thứ

và sớm muộn chúng sẽ lệch nhau ở một trường hợp biên.

### Điều widget này không làm: ghi một khoản mà không mở app

Ghi được nghĩa là phải viết vào IndexedDB, mà chỉ WebView làm được. Chạm vào
widget sẽ mở app với **ô nhập đã sẵn sàng** — bớt được bước tìm app và bước điều
hướng, chứ không bỏ được bước mở app. Nói khác đi là nói quá.

Muốn ghi mà không mở app thì phải nhân đôi kho dữ liệu sang lớp native, và lúc
đó có hai nguồn sự thật phải hợp nhất — cái giá đó lớn hơn nhiều so với một
bước chạm tiết kiệm được.

### Ghi nhận khi làm

- `updatePeriodMillis = 0`: widget **không** tự làm mới theo giờ. Số liệu chỉ đổi
  khi người dùng ghi một khoản, và lúc đó lớp web gọi cập nhật thẳng. Đặt chu kỳ
  tự làm mới chỉ tốn pin để vẽ lại đúng con số cũ.
- Hai `PendingIntent` khác nhau phải có `requestCode` khác nhau, không thì Android
  coi là một và cả hai nút cùng làm một việc.
- Cờ "ghi nhanh" phải được **xoá khỏi intent** sau khi đọc: Android giữ lại intent
  cũ, nên không xoá thì lần mở app tiếp theo từ danh sách gần đây cũng bị coi là
  ghi nhanh và tự bật bàn phím lên.
- `previewLayout` vẽ chính bố cục thật trong bộ chọn tiện ích (Android 12+);
  `previewImage` là bản dự phòng cho máy cũ hơn.

### Việc còn lại cho người dùng

Cắm widget lên màn hình chính là thao tác thủ công: nhấn giữ màn hình chính →
Tiện ích → XAXI → kéo ra. Không tự động hoá được bằng adb vì mỗi lệnh `input` là
một lần chạm riêng, không thành một cử chỉ kéo liên tục.

### Một điều nhỏ phát hiện được — **đã sửa, xem §13**

---

## 13. Thứ tự hiển thị của ví và danh mục

Dexie trả về theo thứ tự **khoá chính**, mà khoá chính là UUID — tức thứ tự
ngẫu nhiên. Nó ổn định với một bộ dữ liệu nhất định nên không ai nhận ra ngay,
nhưng hậu quả thì có thật:

- lưới chip danh mục trong biểu mẫu xếp lộn xộn, không theo logic nào;
- ví mặc định của ô nhập nhanh là một ví bất kỳ, không phải ví hay dùng;
- màn hình chuyển tiền có thể mở ra với **ví nguồn trùng ví đích**, và nút
  Chuyển bị tắt ngay từ đầu.

Cái cuối lộ ra khi viết phép kiểm trên máy — không phải khi dùng app, vì nó chỉ
xảy ra với một số bộ dữ liệu.

### Cách sửa

Mỗi ví và danh mục mang một mốc `createdAt`, và **store sắp thứ tự một lần** cho
mọi màn hình. Để từng màn hình tự sắp thì sớm muộn sẽ có màn hình quên, và
người dùng thấy cùng một danh sách xếp hai kiểu ở hai chỗ.

**Không** sắp theo tên: đổi tên một ví sẽ làm nó nhảy chỗ, và ví mặc định của ô
nhập nhanh đổi theo — một thao tác vô hại gây hệ quả không ai ngờ.

**Không** sắp theo `updatedAt`: sửa một bản ghi sẽ đẩy nó xuống cuối.

### Di trú

`backfillOrder()` gán mốc cho bản ghi cũ một lần, khi mở app:

- bản ghi **trùng tên** với bộ hạt giống lấy đúng chỉ số trong bộ đó, nên thứ tự
  quen thuộc được dựng lại y nguyên: Tiền mặt · Ngân hàng · Ví điện tử;
- bản ghi người dùng tự thêm xếp sau, theo `updatedAt`.

Mốc của bộ hạt giống là số nhỏ (0, 1, 2…) chứ không phải thời gian thật, nên
bản ghi tạo sau — mang `Date.now()` cỡ 1,7 nghìn tỷ — luôn xếp sau.

Bản ghi chưa qua di trú xuống **cuối** chứ không lên đầu: đẩy chúng lên trước sẽ
xáo trộn thứ tự người dùng đang quen, đúng vào lúc nâng cấp.

## 14. Công cụ đọc email ngân hàng — bốn ràng buộc được ép ở tầng mã

`npm run bank:inbox` đọc email biến động số dư từ hộp thư của chính người dùng
và xuất ra CSV để nhập vào app. Nó **không** phải một phần của app: app không
bao giờ hỏi mật khẩu của bất cứ dịch vụ nào, và nguyên tắc đó không đổi vì một
tính năng tiện.

Bốn ràng buộc dưới đây được ép bằng mã chứ không phải bằng lời hứa trong tài
liệu, vì công cụ này cầm mật khẩu hộp thư — thứ nhạy cảm nhất mà cả dự án từng
chạm tới.

**Một — luôn đi qua TLS.** `scripts/imap/client.mjs` chỉ có một đường mở kết
nối duy nhất là `tls.connect`; không tồn tại nhánh nào nối bằng socket trần.
Ngoài ra các cổng vốn dành cho giao thức chưa mã hoá (25, 110, 143, 587) bị từ
chối **trước khi** mở kết nối. Trỏ TLS vào cổng 143 chỉ tạo ra một lỗi bắt tay
khó hiểu, còn người dùng thì tưởng mình đang nối an toàn.

**Hai — chỉ đọc.** Mở hộp thư bằng `EXAMINE` chứ không phải `SELECT`. Nhờ vậy
công cụ *không thể* đánh dấu thư đã đọc, không thể xoá, không thể đổi nhãn —
không phải vì nó chọn không làm, mà vì phiên làm việc không có quyền đó. Một
công cụ lặng lẽ đánh dấu đã đọc toàn bộ thư ngân hàng là một công cụ hỏng, dù
nó lấy dữ liệu đúng.

**Ba — không một gói phụ thuộc nào.** Bộ khách IMAP và bộ giải mã MIME đều tự
viết, tổng cộng dưới 400 dòng. Mỗi gói thêm vào là một cửa nữa mà mật khẩu có
thể đi ra, và một chuỗi cập nhật nữa phải theo dõi. Phần IMAP cần cho việc đọc
vài chục thư nhỏ hơn nhiều so với cái giá đó.

**Bốn — mật khẩu không bao giờ được in ra.** Lệnh `LOGIN` mang mật khẩu, nên
khi nó bị từ chối thì thông báo lỗi chỉ ghi `LOGIN bị từ chối` chứ không in lại
lệnh. Có một bài kiểm riêng cho đúng điều này: nó đăng nhập bằng mật khẩu
`mat-khau-rat-bi-mat` vào một máy chủ luôn trả lời `NO`, rồi khẳng định chuỗi đó
không xuất hiện trong thông báo lỗi.

### Dùng lại đúng bộ đọc của app, không viết bản thứ hai

Công cụ biên dịch thẳng `src/lib/receipt.ts` bằng esbuild rồi nạp vào. Viết một
bộ đọc riêng cho công cụ là có hai bộ luật phải giữ khớp bằng tay, và người dùng
sẽ gặp trường hợp công cụ đọc ra một số còn app dán tay ra số khác. Biên dịch từ
nguồn thì hai bên luôn là một, kể cả khi bộ đọc được sửa sau này.

### Vì sao có một máy chủ IMAP giả trong bộ kiểm thử

Giao thức IMAP trả dữ liệu về theo từng mảnh tuỳ ý, và máy chủ được phép chen
các dòng thông báo không mời mà đến vào giữa phản hồi. Lỗi hay nằm đúng ở chỗ
ghép các mảnh đó lại — thứ mà đọc lại mã không phát hiện được.

Nên `tests/imap.test.ts` dựng một máy chủ TLS thật (chứng chỉ tự ký sinh ngay
trong bài kiểm, không có tệp bí mật nào nằm trong repo), cho nó chen dòng
`* 2 EXISTS` vào giữa phản hồi `EXAMINE`, rồi bắt bộ khách nối tới qua socket
thật và đi hết một vòng. Bài kiểm còn khẳng định nhật ký lệnh của máy chủ là
đúng năm lệnh `LOGIN, EXAMINE, SEARCH, FETCH, LOGOUT` — và **không** có `SELECT`.
Ràng buộc "chỉ đọc" nhờ vậy không thể bị làm hỏng trong im lặng.

### Điều công cụ này KHÔNG làm

Không chạy nền, không hẹn giờ, không tự khởi động. Người dùng gõ lệnh thì nó
chạy, xong thì nó thoát. Đây là điểm khác biệt duy nhất nhưng quan trọng nhất so
với một bot thường trực có quyền đọc hộp thư — xem bảng ở §3.2.

Mật khẩu nằm trong `xaxi-imap.json` trên đĩa người dùng, đã có trong
`.gitignore`. Với Gmail và phần lớn nhà cung cấp, phải dùng **mật khẩu ứng dụng**
riêng chứ không phải mật khẩu chính — mật khẩu ứng dụng thu hồi được bất cứ lúc
nào mà không ảnh hưởng tài khoản.

## 15. Bot Telegram mức A — bot chạy trên máy bạn, không phải máy ai khác

`npm run telegram:bot`. Nhắn "cà phê 35k" cho bot, nó ghi nhận ngay; lúc nào
rảnh gõ `/xuat` để lấy CSV nhập vào app.

### Điều khiến nó là "mức A"

Cái hay của Telegram là bắt được khoản chi ngay lúc vừa tiêu, khi mở app ra là
phiền. Cái dở của một con bot thông thường là nó chạy trên máy chủ của ai đó và
giữ một bản sao toàn bộ chi tiêu của bạn ở ngoài kia — §3.3 gọi đó là thứ nặng
nề nhất về quyền riêng tư trong cả danh sách.

Bot này **chạy trên máy bạn** và **không có cơ sở dữ liệu**. Danh sách chờ nằm
trong bộ nhớ tiến trình; đóng chương trình là hết (và trước khi thoát nó ghi ra
tệp, để không mất). Không tồn tại kho chi tiêu nào ngoài máy bạn.

Telegram vẫn thấy nội dung tin nhắn — điều đó không tránh được và §3.3 đã nói
thẳng từ đầu. Cái tránh được là một kho dữ liệu thứ hai.

### Bốn ràng buộc được ép ở tầng mã

**Một — chỉ nhận tin từ đúng một cuộc trò chuyện.** Bot Telegram là công khai:
ai biết tên nó đều nhắn được. Không chốt theo `chatId` thì người lạ chèn được
giao dịch vào sổ chi tiêu của bạn. Tin từ người lạ bị bỏ qua **im lặng** — trả
lời là xác nhận cho họ biết bot có thật và đang chạy.

**Hai — không một gói phụ thuộc nào.** Bộ khách Bot API tự viết trên `node:https`,
kể cả phần dựng `multipart/form-data` để gửi tệp. Ai có token thì đọc được mọi
tin nhắn gửi tới bot và giả danh nó; mỗi gói thêm vào là một cửa nữa token có
thể đi ra.

**Ba — token không bao giờ được in ra.** Nó nằm ngay trong đường dẫn URL, nên
mọi chỗ ghi lại URL đều phải che đi. Có bài kiểm riêng cho đúng điều này.

**Bốn — bot KHÔNG đoán danh mục.** Nó chỉ tách số tiền, ngày và nội dung. Danh
mục và lịch sử nằm trong IndexedDB trên máy chạy app, không phải ở đây; đoán
bằng một bộ dữ liệu rỗng thì đoán sai, mà đoán sai lại ghi vào sổ thì tệ hơn là
không đoán. Để trống thì lúc nhập, app xếp chúng vào "chờ phân loại" và tự đoán
bằng chính mô hình đã học của bạn.

### Dùng lại đúng bộ đọc của app

`scripts/compile-src.mjs` biên dịch thẳng `src/lib/quickadd.ts` bằng esbuild —
cùng cơ chế mà công cụ đọc email dùng cho `receipt.ts`. Nhờ vậy "ăn trưa ba mươi
lăm nghìn" gõ vào Telegram ra đúng con số như gõ vào ô lệnh trong app, kể cả khi
bộ đọc được sửa sau này.

### Điều bot này KHÔNG làm

**Không nhận tin nhắn thoại.** Phần nhận diện giọng nói của Telegram gửi âm
thanh lên dịch vụ bên ngoài, trong khi XAXI đã có giọng nói chạy thẳng trên máy
— đổi sang cách kia là đi lùi về quyền riêng tư. Nhắn thoại cho bot thì nó trả
lời đúng câu đó.

Không chạy nền, không hẹn giờ, không tự khởi động. Bạn chạy thì nó chạy.

### Một đánh đổi đã cân nhắc: `/xuat` gửi tệp qua Telegram

Đường đi thật của người dùng là: đang ở ngoài, nhắn cho bot bằng điện thoại —
rồi cần đưa kết quả vào app **cũng trên điện thoại đó**. Nếu `/xuat` chỉ ghi ra
đĩa máy tính thì người đang cầm điện thoại chẳng nhận được gì.

Nên mặc định nó vừa ghi ra đĩa vừa gửi tệp vào cuộc trò chuyện. Tệp đó **không
thêm thông tin gì mới cho Telegram**: mọi dòng trong nó đều đến từ tin nhắn
chính bạn đã gõ ở đấy. Ai vẫn muốn tắt thì đặt `guiTep: false`.

## 16. Đồng bộ đa thiết bị — một tệp bạn tự mang đi

Không có máy chủ, không có tài khoản. App mã hoá toàn bộ dữ liệu thành một tệp
`.xaxi`; bạn tự mang nó sang máy kia bằng bất cứ đường nào — Drive, USB, tự gửi
cho chính mình. Máy kia nhập đúng cụm mật khẩu là đọc được.

§3.6 nghiêng về "thư mục app trên Drive của người dùng". Cách làm ở đây đi xa
hơn một bậc theo cùng hướng đó: **app không biết Drive là gì**. Không OAuth,
không client id phải nhúng vào bản phát hành, không quyền truy cập kho tệp nào.
Người dùng cầm tệp và tự quyết để nó ở đâu. Thêm Drive sau này chỉ là tự động
hoá đúng một việc "chuyển tệp", không đụng gì tới phần mã hoá hay hợp nhất.

### Ba tầng, làm theo thứ tự đó

**Tầng một — bia mộ.** Xoá hẳn một bản ghi thì máy kia vẫn giữ bản cũ, thấy máy
này thiếu, và gửi ngược về. `softDelete()` ghi lại việc đã xoá; `live()` lọc nó
khỏi mọi đường đọc. Phải có TRƯỚC khi bật đồng bộ, và nó là thay đổi rủi ro
nhất trong cả ba tầng vì quên lọc một chỗ là khoản đã xoá hiện lại đúng ở đó.

**Tầng hai — mã hoá.** PBKDF2-SHA256 250.000 vòng dẫn ra khoá AES-GCM 256, bằng
WebCrypto có sẵn. Không thêm thư viện mã hoá nào: tự viết mã hoá là sai lầm
kinh điển, mà nhét thêm một gói vào đúng chỗ cầm khoá của người dùng cũng không
khá hơn. Muối và véc-tơ khởi tạo nằm ngoài phần mã hoá — chúng không phải bí
mật, chúng tồn tại để cùng một cụm mật khẩu không bao giờ sinh ra hai tệp giống
hệt nhau.

**Tầng ba — hợp nhất.** "Bản mới hơn thắng" theo từng bản ghi, đúng như §3.6 đã
chốt. Hoà `updatedAt` thì phá thế hoà bằng `deviceId` — không phải vì máy nào
quan trọng hơn, mà để hai máy cùng ra một kết quả; phá thế hoà ngẫu nhiên thì
chúng không bao giờ hội tụ.

### Vấn đề khó hơn "bản mới hơn thắng"

Quy tắc đó chỉ giải được xung đột khi hai bên nói về **cùng một id**. Chỗ khó
nằm ở nơi khác: hai máy sinh ra hai bản ghi **khác id** cho cùng một thứ.

Mỗi máy lúc mới cài đều tự gieo bộ danh mục mặc định, nên cả hai đều có "Ăn
uống" — với hai UUID khác nhau, và giao dịch ở mỗi máy trỏ vào id của riêng máy
đó. Ghép thẳng lại thì người dùng có hai danh mục "Ăn uống", mỗi cái giữ một
nửa số liệu, và không có gì báo.

Nên trước khi hợp nhất phải **gộp trùng theo khoá tự nhiên**, rồi **nối lại mọi
khoá ngoại** đang trỏ vào bản thua. Bản thua không bị bỏ đi mà bị đánh bia mộ —
máy kia cũng phải biết là nó đã được gộp.

| Bảng | Khoá tự nhiên | Vì sao |
|---|---|---|
| Danh mục | loại + tên | hai máy cùng gieo bộ mặc định |
| Ví | tên | như trên |
| Ngày không chi tiêu | ngày | cột `date` là chỉ mục DUY NHẤT — hai bản là vỡ |
| Ngân sách | tháng + danh mục | hai hạn mức cho một danh mục là vô nghĩa |
| Cài đặt | bản ghi đơn | hai dòng thì app đọc phải dòng nào là tuỳ may rủi |
| Bút toán đối soát | ví + ngày | §3.6 gọi tên: hai máy cùng đối soát là bù HAI LẦN |
| Giao dịch thường | *không có* | hai lần mua cà phê giống hệt vẫn là hai lần tiêu |

Thứ tự quan trọng: gộp danh mục và ví TRƯỚC, nối khoá ngoại, rồi mới gộp ngân
sách — vì khoá tự nhiên của ngân sách có chứa `categoryId`.

### Bắt buộc xuất bản sao lưu trước khi bật

Mã hoá đầu-cuối nghĩa là **không có cửa sau**: quên cụm mật khẩu là mất sạch tệp
đó, người viết app cũng không mở được. Bản sao lưu JSON thường không cần mật
khẩu, nên nó là đường lui duy nhất — và phải có trước. Thẻ Đồng bộ trong Cài đặt
khoá cho tới khi người dùng bấm "Xuất bản sao lưu rồi bật"; mốc đó ghi vào
`settings.syncReadyAt`.

Cụm mật khẩu **không được lưu ở đâu cả**, gõ lại mỗi lần. Lưu nó đi thì có thêm
một bí mật nằm trên đĩa, mà lợi ích chỉ là đỡ gõ vài giây cho việc mỗi tuần làm
một lần.

### Hai điều đã kiểm trên máy thật

WebCrypto và `CompressionStream` đều chạy trong WebView Android — tệp `.xaxi` ra
tới bảng Chia sẻ thật.

Và một lỗi chỉ lộ ra vì thử đúng lúc 1h13 sáng: `syncFileName()` dùng
`toISOString()`, tức ngày theo giờ UTC. Ở Việt Nam (UTC+7) thì từ 0h tới 7h
sáng nó lùi lại một ngày, nên bản sao lưu ghi 30/09 còn tệp đồng bộ xuất sau đó
vài giây ghi 29/09 — người dùng không biết tệp nào mới hơn. Đã đổi sang
`todayISO()` như cả phần còn lại của app.

### Hai lỗi chỉ lộ ra khi bấm nút thật trên máy

Cả hai đều qua được 280 bài kiểm, và cả hai đều chặn hẳn tính năng.

**Một — không chọn nổi chính tệp app vừa xuất.** Ô chọn tệp đặt
`accept=".xaxi,application/json"`. Nhưng Android dựng bộ chọn tệp theo MIME chứ
không theo đuôi; `.xaxi` không có MIME nào nên phần đó bị bỏ qua hoàn toàn, và
tệp hiện ra trong danh sách **bị làm mờ, không bấm được**. Bỏ hẳn bộ lọc: chọn
nhầm tệp khác thì đã có thông báo rõ ràng đỡ, còn một bộ lọc giấu mất tệp duy
nhất mà tính năng sinh ra thì tệ hơn hẳn.

**Hai — máy mới xoá mất số dư của máy cũ.** Đây là lỗi nặng, và nó nằm ngay ở
lần dùng thật đầu tiên.

Cài app lên máy mới, nó gieo "Tiền mặt" với số dư đầu kỳ 0 vào lúc T2. Nhập tệp
từ máy cũ có "Tiền mặt" thật, sửa lần cuối lúc T1 < T2. Hai ví cùng tên bị gộp —
và cái **mới hơn**, tức cái **trắng**, thắng. Số dư đầu kỳ biến mất, không một
lời báo.

Đo trên máy thật trước khi sửa: nhập một tệp chứa ba giao dịch tổng 146.000 đ mà
số dư tụt 2.146.000 đ. Hai triệu chênh ra chính là số dư đầu kỳ bị ví trắng ghi
đè.

Gốc rễ: bản ghi gieo sẵn **không phải một chỉnh sửa của người dùng**, nó là chỗ
trống có sẵn tên — nên nó phải THUA mọi bản thật. `seedStamp()` đóng mốc sửa
bằng 0. Người dùng đổi tên hay đặt số dư thì `touch()` nâng mốc lên và bản đó
thắng bình thường.

Sau khi sửa, đo lại đúng đường đó: số dư ra 1.854.000 đ = 2.000.000 − 146.000.

---

### Hai câu hỏi cuối §3.6

Đã chốt cả hai — xem §18.

## 17. Chạy bộ rà trên máy đang có dữ liệu thật

`npm run device:check` lái app qua cổng gỡ lỗi WebView, mà bản phát hành **cố
ý tắt** cổng đó. Cài bản debug thường đè lên thì Android từ chối vì khác chữ
ký, còn gỡ app ra là xoá sạch dữ liệu tài chính thật của người dùng — tức là bộ
rà chỉ chạy được trên máy trống, đúng nơi nó ít giá trị nhất.

`npm run android:debug-signed` ký bản debug bằng **khoá phát hành**. Cùng chữ
ký thì cài đè được, dữ liệu giữ nguyên, và bộ rà chạy trên chính máy thật.

### Vì sao phải có cổng bật, không để mặc định

Một bản debug ký bằng khoá phát hành là **một bản cập nhật hợp lệ của app**: nó
mở cổng gỡ lỗi và không rút gọn mã. Để mặc định thì sớm muộn có bản như vậy đi
ra ngoài. Nên khối ký chỉ có tác dụng khi biến môi trường
`XAXI_DEBUG_RELEASE_SIGNED=1` — biến nó thành một việc phải cố ý làm.

Rà xong phải cài lại bản phát hành ngay. Kiểm được: chuyển tiếp cổng
`webview_devtools_remote_<pid>` rồi gọi `/json/list`; bản phát hành phải từ chối.

### Lần chạy đầu sau khi làm bia mộ

Đây là lý do việc này đáng làm. Bia mộ đụng vào **mọi đường đọc dữ liệu** trong
app; quên lọc một chỗ thì khoản đã xoá hiện lại đúng ở đó, mà các chỗ khác vẫn
đúng nên nó nhìn như dữ liệu hỏng chứ không như lỗi mã. 282 bài kiểm không thấy
được điều đó, vì chúng gọi thẳng vào hàm chứ không đi qua giao diện.

Kết quả: **21/21 đạt**, và bộ rà tự trả lại dữ liệu ban đầu sau khi chạy.

## 18. Hai câu hỏi cuối, và câu trả lời

§3.6 để ngỏ hai điều. Để ngỏ mãi thì chúng biến thành nợ: mỗi tính năng sau này
đều phải chừa chỗ cho một khả năng có thể không bao giờ làm.

### Chung ví giữa nhiều người — **không làm chế độ riêng**

Câu hỏi gốc: có cho vợ chồng dùng chung một sổ không, và điều đó đổi hẳn mô hình
khoá.

Hoá ra **trường hợp đơn giản đã chạy được rồi, không cần viết thêm dòng nào**:
hai người cùng đặt một cụm mật khẩu, trao tệp `.xaxi` cho nhau, và bộ hợp nhất
lo phần còn lại. Nó vốn được thiết kế cho hai máy, mà hai máy của hai người thì
cũng chỉ là hai máy.

Thứ **không** chạy là chia sẻ MỘT PHẦN: chi tiêu chung thì chung, chi tiêu riêng
thì riêng. Cái đó đòi mã hoá theo từng phạm vi, tức hai hệ khoá song song, và nó
phá vỡ lời hứa đang rất gọn — *một cụm mật khẩu, toàn bộ dữ liệu của bạn*. Với
một cặp đã dùng chung sổ thì câu "ai tiêu khoản này" trả lời được bằng một danh
mục hoặc một dòng ghi chú, rẻ hơn nhiều so với chẻ đôi mô hình khoá.

**Chốt:** không xây chế độ chung ví. Ai cần chung hoàn toàn thì đã dùng được
ngay hôm nay. Ai cần chung một phần thì dùng hai sổ.

### Tự động hay bấm nút — **bấm nút, và không phải vì pin**

Câu hỏi gốc cân nhắc pin và sự bất ngờ. Nhưng lý do thật nằm chỗ khác.

Đồng bộ tự động đòi một chỗ chứa mà **app tự tới được**: một tài khoản, một
client id nhúng sẵn trong bản phát hành, và quyền ra mạng. Đó đúng là ba thứ app
hứa không có. Nên "bấm nút" không phải một sự nhân nhượng để tiết kiệm pin — nó
là **hệ quả** của việc không có máy chủ. Muốn tự động thì phải bỏ lời hứa trước.

### Nửa còn lại: "bấm nút thì lại quên"

Nửa này là thật, và nó có câu trả lời riêng. `lib/sync/reminder.ts` theo dõi mốc
đồng bộ gần nhất; quá bảy ngày **và** có giao dịch ghi sau mốc đó thì màn hình
chính hiện một dòng nhắc kèm số khoản chưa mang đi.

Hai điều kiện, không phải một:

- **Chưa bao giờ đồng bộ thì không nhắc.** Người dùng chưa chọn dùng tính năng
  này; nhắc lúc đó là chào hàng, không phải giúp.
- **Không có gì mới thì không nhắc**, dù đã ba mươi ngày. Nhắc trong lúc không có
  gì để mang đi là dạy người dùng bỏ qua lời nhắc — rồi họ bỏ qua luôn lần thật
  sự cần.

Lời nhắc đồng bộ nhường chỗ cho lời nhắc "đã lâu chưa ghi gì": hai dòng cùng lúc
thì không dòng nào được đọc.

## 19. Số hiệu bản dựng

`versionCode` và `versionName` sinh từ git mỗi lần đồng bộ sang Android:

```
XAXI · 1.0.0+46* · a1aabc3 · hoạt động offline
```

`46` là số commit, `a1aabc3` là mã commit, dấu `*` nghĩa là bản này dựng từ cây
làm việc còn thay đổi chưa commit.

Trước đây cả hai viết cứng thành `1`/"1.0", nên **mọi bản dựng đều giống nhau**.
Trong một buổi chiều đã có hơn chục bản cài chồng lên nhau; nếu có lỗi thì không
ai nói được máy đang chạy bản nào, và bản vừa sửa với bản hỏng nhìn y hệt.

Android còn đòi `versionCode` **tăng dần** thì mới nhận bản cập nhật. Số commit
thoả điều đó một cách tự nhiên, không cần ai nhớ tăng tay.

### Một bài kiểm bắt được điều mà mắt không thấy

Bản đầu dùng thẳng `__APP_VERSION__` — biến do **Vite** thay lúc build — trong
màn hình Cài đặt. Bản web chạy đúng. Nhưng bộ chạy kiểm dùng esbuild, không biết
biến đó, nên Cài đặt ném `ReferenceError` ngay khi render.

Bài kiểm bắt được không phải bài nào về phiên bản, mà là **"mọi lệnh đều mở được
màn hình của nó"** — nó có đi qua Cài đặt. Đó chính là lý do bài kiểm quét toàn
bộ lệnh đáng giá hơn nhiều bài kiểm chuyên biệt gộp lại.

`lib/version.ts` hỏi `typeof` trước khi dùng, nên mã không còn phụ thuộc vào một
bộ đóng gói cụ thể.

## 20. Bộ rà giờ có chạm tới đồng bộ

Đồng bộ là đoạn mã nguy hiểm nhất trong app: nó ghi đè toàn bộ cơ sở dữ liệu.
Mà bộ rà 21 mục lại không chạm tới nó — nên khi thử tay, tìm ra **hai lỗi chặn
hẳn tính năng, cả hai đều đã qua được 280 bài kiểm**. Giờ có ba mục mới:

| Mục | Nó bắt cái gì mà bài kiểm trên máy tính không bắt được |
|---|---|
| Mã hoá và nén chạy được trong WebView | Node có bản WebCrypto riêng. WebView cũ có thể thiếu `CompressionStream`, và lúc đó tệp tạo ra được nhưng mở lại không được |
| Nhập tệp, gộp trùng, nối lại khoá ngoại | Đi qua đúng ô chọn tệp thật của giao diện, và ghi vào IndexedDB thật |
| Nhập lại lần hai không sinh thêm gì | Hội tụ — nếu sai thì mỗi lần đồng bộ lại thấy có thay đổi, mãi mãi |

Phép kiểm tự dựng tệp `.xaxi` ngay trong trang bằng đúng những nguyên thuỷ mà
app dùng. Không gọi hàm của app được — cầu nối gỡ lỗi chạy trong trang, còn các
module thì đã bị đóng gói và không nằm trên `window`. Nhờ vậy nó còn đối chiếu
luôn rằng **định dạng phong bì thực sự là thứ ta nghĩ**.

### Ba lỗi của chính bộ rà, tìm ra khi viết ba mục này

**Một — trùng tên biến.** Hàm nén tôi thêm vào phần dùng chung tên là `nen`,
trùng đúng biến `nen` (nền thu nhập) trong phép kiểm sáu hũ. Một mục đang xanh
bỗng đỏ, và nguyên nhân không liên quan gì tới nó.

**Hai — `location.reload()` giết ngữ cảnh eval.** Mục kiểm cổng khoá cần ghi lại
settings rồi nạp lại trang để giao diện đổi. Nạp lại xong thì `page.eval` không
bao giờ trả về gì. Luật đó là logic hiển thị thuần nên đã chuyển sang
`tests/app.test.tsx` — đúng chỗ hơn, và chạy trong một phần trăm giây.

**Ba — một mục trả về `undefined` làm đổ cả bộ rà.** Nó in xong 27 dòng kết quả
rồi mới vỡ ở dòng tổng kết, mất sạch. Giờ mục không trả về gì thì tính là trượt,
và bộ rà vẫn tổng kết được.

Ba lỗi này đều ở chính công cụ kiểm, không ở app. Đáng ghi lại: một bộ rà hỏng
lặng lẽ còn tệ hơn không có bộ rà, vì nó cho cảm giác đã kiểm rồi.

Kết quả: **24/24 đạt** trên A50s, dữ liệu thật giữ nguyên nhờ
`npm run android:debug-signed`.

## 21. Bản web: một lỗi im lặng nữa, cùng đúng một kiểu

Bản web và bản desktop không được mở lần nào trong suốt đợt làm biểu tượng, bia
mộ, đồng bộ và OCR. Mở ra thì giao diện chạy bình thường — nhưng đường xuất tệp
đồng bộ có một lỗ.

```js
try {
  const envelope = await buildSyncFile(cumMatKhau)   // ném lỗi ở đây thì…
  …
} finally {
  setDangDongBo(false)                                // …chỉ có dòng này chạy
}
```

Không có `catch`. `buildSyncFile` ném lỗi là người dùng nhận được **đúng con số
không**: nút hết mờ, và hết. Đây là lần thứ ba trong dự án gặp đúng kiểu hỏng
này — hai lần trước là đường xuất bản sao lưu trên Android (báo thành công mà
không tạo ra tệp nào) và đường chia sẻ văn bản.

### Và có một nguyên nhân cụ thể, không phải giả định

`crypto.subtle` **chỉ tồn tại trong ngữ cảnh an toàn**. HTTPS, localhost, Tauri
và Capacitor đều an toàn — nhưng bản web tự dựng trên một địa chỉ LAN qua HTTP
thường thì nó là `undefined`, và lời gọi đầu tiên ném ra
`TypeError: Cannot read properties of undefined`. Câu đó không nói với người
dùng điều gì cả, mà ở đây nó còn không bao giờ tới được người dùng.

Hai bản vá, cả hai đều cần:

- `crypto.ts` kiểm WebCrypto **trước**, và nói thẳng: trang đang mở qua kết nối
  không an toàn, hãy dùng HTTPS, localhost, hoặc bản cài trên máy.
- Nút xuất có `catch` hiện lỗi ra. Không lỗi nào được phép biến mất.

### Bài học lặp lại đủ ba lần thì đáng thành luật

**Mọi thao tác đưa dữ liệu ra khỏi app đều phải có `catch` hiện lỗi.** Đường đi
ra là đường hay hỏng nhất — nó chạm vào hệ điều hành, vào quyền, vào khả năng
của trình duyệt — và cũng là đường mà người dùng tin tưởng nhất, vì họ tưởng dữ
liệu đã an toàn ở đâu đó.

## 22. Bản desktop đã hỏng từ lâu mà không ai biết

`npm run desktop:build` chưa chạy được lần nào kể từ commit đổi mã định danh
sang `com.mittohoa.xaxi_wallet`. Lý do: **Tauri từ chối dấu gạch dưới** trong
bundle identifier. Bản vá cho Android đã lặng lẽ làm hỏng bản desktop, và vì
không ai mở bản desktop nên nó nằm im như thế qua rất nhiều commit.

Đổi phía Tauri sang `com.mittohoa.xaxi-wallet`. **Không** đổi phía Android: đó
là `applicationId` của gói đã cài trên máy người dùng, đổi nó nghĩa là một app
khác hẳn và mất sạch dữ liệu. Hai nền tảng không cần trùng mã định danh.

### Và một lỗi thứ hai, cùng khuôn với `adb`

`cargo` có trên máy nhưng **không nằm trong PATH** của cả PowerShell lẫn bash —
rustup chỉ thêm `~/.cargo/bin` vào shell đăng nhập. Nên lệnh đổ ngay dòng đầu
với "cargo not found", dù bộ công cụ đã cài đủ.

Đây là lần thứ ba dự án gặp đúng chuyện này: JDK, rồi `adb`, giờ `cargo`. Cách
giải đã thành khuôn — **đừng tin PATH, đi tìm**. `scripts/desktop.mjs` dò
`~/.cargo/bin` rồi tự thêm vào PATH của tiến trình con.

### Kết quả

Dựng xong trong 6 phút 17 (lần đầu, biên dịch từ đầu), ra `xaxi.exe` 3,1 MB.
Chạy thử: cửa sổ mở được, tiêu đề "XAXI — Quản lý thu chi".

Bốn mặt của app giờ đều đã được mở ít nhất một lần trong cùng một đợt: Android
(bản phát hành trên A50s), web (Chrome thật), desktop (Windows), và bộ rà 24 mục
chạy qua giao diện thật.

## 23. Chia sẻ ảnh giao dịch vào app

Chụp màn hình chuyển khoản trong app ngân hàng hay ví điện tử, bấm Chia sẻ,
chọn Ví XAXI. App đọc chữ trong ảnh, tách ra giao dịch, đoán danh mục, và mở
màn biên lai đã điền sẵn để bạn duyệt.

Đo trên máy thật với một ảnh chụp có **bốn con số lớn** — số tiền, số tài khoản,
mã giao dịch, số dư:

```
−1.250.000 đ · 30/09/2026 · "tien nha thang 9"
Nguồn: Vietcombank · Danh mục: 🏠 Nhà cửa
Đối soát số dư ví về 8.420.500 đ (đọc được từ tin nhắn)
```

Đúng cả số tiền lẫn số dư, và danh mục tự gắn từ nội dung.

### Ảnh không bao giờ rời khỏi tầng native

Đường hiển nhiên là đưa ảnh sang JavaScript rồi gửi ngược xuống cho ML Kit. Làm
thế thì một ảnh chụp 2 MB phải mã hoá base64 **hai lượt**.

Nhưng bộ đọc chữ đã nằm sẵn bên Java, nên ảnh được đọc và nhận dạng hoàn toàn ở
đó; chỉ đoạn **chữ** đi ngược lên — vài trăm byte. Đây đúng là chỗ mà "app chạy
trong WebView" bị mang tiếng oan: cầu nối chỉ đắt khi ta bắt nó chở dữ liệu
nhị phân, mà ở đây không cần.

**Không tự lưu thẳng.** Ảnh chụp có thể dính nhầm số dư thay vì số tiền giao
dịch, và một khoản ghi sai vào sổ thì khó phát hiện hơn nhiều so với một lần
bấm thêm.

### Ba lỗi trên đường đi, cái thứ hai đáng nhớ nhất

**Một — `onCreate` không bắt ảnh.** Nó gọi `captureSharedText` và `captureQuick`
nhưng thiếu `captureSharedImage`, nên chia sẻ lúc app đang ĐÓNG thì Android tạo
Activity mới, `onNewIntent` không chạy, và ảnh rơi mất im lặng.

**Hai — bộ vá manifest bỏ qua chính bản vá mới.** `patch-android-manifest.mjs`
có dòng "gọi nhiều lần không sao — có kiểm tra trước khi chèn": thấy đã có
`intent-filter` là trả về ngay. Nên khi thêm `image/*` vào khuôn mẫu, dòng đó
**không bao giờ được áp** lên manifest đã có sẵn.

Và lỗ hổng bị chính cách thử che đi: `am start -n` chỉ định thẳng component thì
Android không cần khớp intent-filter nào cả, nên thử kiểu đó vẫn chạy. Chỉ khi
mở bảng Chia sẻ thật mới lộ ra app không có trong danh sách. Bài học: **thử một
intent-filter bằng cách chỉ định thẳng component là không thử gì cả.**

**Ba — `SecurityException` khi đọc URI.** Bên gửi cấp quyền đọc tạm cho đúng tệp
đó; gửi bằng `am start` từ shell thì quyền không theo. Không phải lỗi của app,
nhưng nó dạy một điều: `catch { return "" }` tôi viết trong `consumeSharedImageText`
đã nuốt sạch lỗi, nên phải đặt dấu vết ở tầng Java mới thấy được nguyên nhân.

---

## 24. Đổi tên thành "Ví XAXI"

Trên máy người dùng có **hai app cùng tên "XAXI"**, và trong bảng Chia sẻ thì
không cách nào phân biệt — đã bấm nhầm vào app kia một lần.

Tên mới không chỉ khác, mà còn **xếp xuống chữ V** — cách hẳn khỏi "XAXI" trong
mọi danh sách sắp theo bảng chữ cái. Và nó đúng nghĩa: mã gói vốn là
`xaxi_wallet`.

`applicationId` **không đổi**. Đổi nó là một app khác hẳn với Android, và người
dùng mất sạch dữ liệu.

Nhãn phải vá riêng: Capacitor sinh `strings.xml` đúng một lần lúc `cap add` và
không cập nhật lại khi sync, nên đổi `appName` trong `capacitor.config.ts` là
chưa đủ — nhãn cũ nằm lại mãi trong thư mục `android/`, mà thư mục đó gitignore
nên không ai thấy nó đã lệch.

### Biểu tượng: nền lime thay vì nền mực

Ở cỡ 40px trong một danh sách, "chữ X trên nền tối" của hai app nhìn y hệt nhau.
Nền lime phân biệt được từ xa, không cần đọc chữ — và nó trùng với thẻ số dư
trên màn hình chính, nên biểu tượng và app nhìn ra cùng một thứ.

Hình giữ nguyên: hai đường xu hướng cắt nhau. Đường tăng trưởng đổi từ lime sang
mực, vì nền đã là lime.

Lớp trước vẽ bằng **VectorDrawable** chứ không phải PNG — máy này không có bộ
dựng ảnh, mà vector thì viết tay được, sắc nét ở mọi cỡ, và sửa một lần là cả
năm độ phân giải đổi theo.

**Vùng an toàn:** khung là 108dp nhưng hệ điều hành cắt chỉ còn 72dp ở giữa. Bản
đầu toạ độ chạy từ 33 đến 93 và chữ X bị cắt mép ngay trên màn hình chính. Toạ
độ tính bằng cách chiếu hệ 512 của `brand/icon.svg` vào khung 108:
`x' = 54 + (x - 256) * 66/512`.
