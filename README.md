# XAXI — Quản lý thu chi cá nhân

**Android là nền tảng gốc.** Web (GitHub Pages) và desktop dùng chung codebase; iOS bật sau mà không phải sửa code.

Dữ liệu nằm hoàn toàn trên thiết bị (IndexedDB). Không tài khoản, không máy chủ, không quảng cáo.

---

## Giao diện: ô nhập là toàn bộ app

Không tab, không menu, không nút cộng. Mở app ra chỉ có **một con số và một ô nhập**. Cùng một ô đó nhận cả ba việc:

| Bạn gõ | App hiểu |
|---|---|
| `cà phê 35k` | ghi một khoản chi |
| `xăng 100k hôm qua` | ghi vào ngày khác |
| `+15tr lương` | ghi khoản thu |
| `tháng này ăn uống bao nhiêu` | trả lời ngay tại chỗ |
| `chi nhiều nhất vào việc gì` | phân bổ theo danh mục |
| `tuần này so với tuần trước` | so sánh hai kỳ |
| `còn bao nhiêu tiền` | số dư từng ví |
| `grab` | tìm trong ghi chú |
| `ngân sách`, `cài đặt`, `đối soát` | mở màn hình tương ứng |

Trong lúc gõ, app hiện luôn nó sắp làm gì — nên không bao giờ lỡ tay ghi nhầm một câu hỏi thành khoản chi.

## AI: chạy trên máy, và chỉ để giảm công nhập liệu

Mọi thứ dưới đây chạy **hoàn toàn trên thiết bị**. Không gọi mạng, không tải mô hình, không một byte dữ liệu tài chính
nào rời khỏi máy. Và mỗi thứ phải trả lời được câu hỏi *"nó giảm công nhập liệu hay giữ số liệu đúng khi người dùng
lười?"* — không trả lời được thì không làm.

**Phân loại tự học** (`src/lib/learn.ts`) — một bộ Naive Bayes huấn luyện trên chính ghi chú của bạn. Ghi `học tiếng anh`
vài lần, sau đó gõ `tiếng anh 300k` là nó tự xếp vào Giáo dục dù không từ khoá nào khớp. Quan trọng hơn: **nó im lặng
khi không có bằng chứng** thay vì đoán bừa — ghi sai danh mục còn tệ hơn để trống. Thứ tự ưu tiên là ghi chú từng dùng →
đã học → từ khoá → chưa phân loại, và app luôn hiện nó dựa vào đâu.

**Phát hiện khoản định kỳ** — tìm những khoản lặp đều để đề xuất tự động hoá. Điều kiện khắt khe (ít nhất 3 lần, khoảng
cách lệch không quá 25%, số tiền lệch không quá 20%) vì đề xuất sai nghĩa là tự động ghi nhầm tiền của người ta. Một
chạm là khoản đó không bao giờ phải nhập tay nữa.

### Còn lại, theo đúng thứ tự

| Tiện ích | Chạy ở đâu | Dữ liệu ra ngoài | Trạng thái |
|---|---|---|---|
| Phân loại tự học · phát hiện định kỳ | trên máy | không | **xong** |
| Nhập CSV / Excel (.xlsx) | trên máy | không | **xong** |
| OCR ảnh biên lai (ML Kit unbundled) | trên máy | không | **xong** |
| Giọng nói (SpeechRecognizer, ưu tiên offline) | trên máy | không | **xong** |
| Đọc số tiền nói bằng lời tiếng Việt | trên máy | không | **xong** |
| Online · đồng bộ nhiều thiết bị | — | — | **chỉ cân nhắc khi offline đã hoàn chỉnh** |

Quyền trên máy thật, kiểm bằng `adb shell dumpsys package com.mittohoa.xaxi_wallet`:

```
requested permissions:
  android.permission.INTERNET
  android.permission.RECORD_AUDIO      <- granted=false, chỉ hỏi lúc bấm micro
  android.permission.ACCESS_NETWORK_STATE
```

**Không có quyền CAMERA** — ảnh do app camera của hệ thống chụp hộ qua `<input type="file" capture>`.
Không SMS, không notification listener, không Accessibility Service.

Model của ML Kit **không nhồi vào APK** — tải qua Google Play Services lần đầu dùng, nên bản cài vẫn ~4 MB.

---

## Vấn đề thật sự của app thu chi: người dùng bỏ ngang

Hầu hết app loại này chết vì **chi phí nhập liệu**, không phải vì thiếu tính năng. Bận vài ngày → thủng dữ liệu →
số liệu sai → mất niềm tin → bỏ luôn. XAXI được thiết kế quanh một nguyên tắc:

> **Con số tổng phải đúng ngay cả khi bạn không ghi chi tiết.**

Các cơ chế hiện thực nguyên tắc đó:

| Cơ chế | Giải quyết | Công sức |
|---|---|---|
| **Ghi nhanh một dòng** — `cà phê 35k`, `xăng 100k hôm qua`, `+15tr lương` | Nhập một khoản mất quá nhiều thao tác | ~3 giây |
| **Phím tắt tự học** — app tự rút ra khoản bạn hay chi, một chạm là ghi | Khoản lặp đi lặp lại | 1 chạm |
| **Khoản định kỳ** — tiền nhà, internet, lương tự ghi khi tới ngày | Quên những khoản biết trước | 0 |
| **Đối soát số dư** ⭐ — gõ đúng một con số, chênh lệch vào *"Chi chưa rõ"* | Không ghi kịp / không ghi nổi từng khoản | ~10 giây/tuần |
| **Hộp chờ phân loại** — ghi số tiền trước, chọn danh mục sau (hoặc không bao giờ) | Bị ép phân loại ngay lúc bận | 0 |
| **Lấp khoảng trống** — liệt kê ngày chưa ghi, mỗi ngày một chạm `Không chi` hoặc số ước tính | Thủng dữ liệu sau vài ngày bận | ~30 giây/tuần |
| **Độ phủ dữ liệu thay cho streak** | Đứt chuỗi → mặc cảm → bỏ app | — |
| **Nhắc theo ngưỡng** — chỉ nhắc khi đã trống ≥3 ngày | Nhắc hằng ngày gây nhờn | — |

Điểm mấu chốt: app **phân biệt "ngày không chi tiêu" với "ngày quên ghi"**. Nhờ vậy số liệu vẫn toàn vẹn kể cả khi bạn lười.

## Thanh toán không tiền mặt — ghi nhận thế nào mà không đụng quyền hệ thống

XAXI **không** đọc SMS, **không** dùng NotificationListener, **không** dùng Accessibility Service, **không** kết nối
tới ngân hàng và **không** hỏi tài khoản/mật khẩu ngân hàng. Ba lối vào hợp lệ, đều bắt đầu từ hành động chủ động của bạn:

1. **Dán / chia sẻ biên lai** — copy tin nhắn biến động số dư hoặc thông báo MoMo/ZaloPay rồi dán vào app.
   Bộ đọc tách ra số tiền, ngày, nơi chi **và số dư mới** → tự đối soát ví luôn.
   Trên Android/PWA, app còn xuất hiện trong menu *Chia sẻ* của hệ thống (Web Share Target), khỏi cần copy-paste.
2. **Nhập sao kê CSV** — bạn tự xuất sao kê từ app ngân hàng rồi chọn tệp. App tự nhận cột, tự đánh dấu dòng trùng.
   Một lần nhập phủ cả tháng — cách bắt kịp nhanh nhất sau khi bỏ bê.
3. **Đối soát số dư** — không cần biên lai, chỉ cần số dư thật.

Tệp và văn bản được xử lý ngay trên máy, không gửi đi đâu.

---

## Chạy thử (web)

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 96 test: phần lõi, bộ hiểu ngôn ngữ, và render thật app trên jsdom
npm run build      # xuất ra dist/
```

Lần đầu mở app sẽ trống. Để xem app trông thế nào khi đã dùng vài tháng:
gõ `cài đặt` → Dữ liệu → **Nạp dữ liệu mẫu** (3 tháng chi tiêu, có sẵn ngày trống, khoản chờ phân loại và một bút toán đối soát để bạn thử các cơ chế).

## Xuất bản web lên GitHub Pages

1. Đẩy repo lên GitHub.
2. *Settings → Pages → Source*: chọn **GitHub Actions**.
3. Push vào nhánh `main`. Workflow `.github/workflows/deploy-pages.yml` sẽ chạy test, build và deploy.

`vite.config.ts` đặt `base: './'` nên app chạy đúng ở cả đường dẫn con (`user.github.io/XAXI-app/`) lẫn thư mục gốc.

## Windows (và macOS / Linux) — Tauri

Cần cài thêm: [Rust](https://rustup.rs) và **Microsoft C++ Build Tools** (workload *Desktop development with C++*).
WebView2 đã có sẵn trên Windows 10/11.

```bash
npm run desktop:dev      # chạy thử cửa sổ desktop
npm run desktop:build    # xuất .msi + .exe vào src-tauri/target/release/bundle/
```

macOS và Linux dùng đúng cấu hình này — `bundle.targets` đã khai báo sẵn `dmg`, `deb`, `appimage`. Workflow
`.github/workflows/desktop.yml` build cả ba hệ điều hành trên CI, không cần máy macOS ở nhà.

## Android — Capacitor

Đã kiểm thử thật trên **Galaxy A50s** (Android 13, API 33, arm64-v8a).

Cần JDK 17+ và Android SDK. Nếu máy đã cài Android Studio thì có sẵn cả hai, chỉ cần trỏ đúng:

```bash
export JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
```

```bash
npm run android:add       # chỉ lần đầu — sinh thư mục android/, vá manifest, chép mã native
npm run android:apk       # bản debug
npm run android:install   # bản debug, cài thẳng vào máy đang cắm
npm run android:release   # bản phát hành, đã rút gọn mã
npm run android:open      # mở Android Studio
```

| | Kích thước | Ghi chú |
|---|---|---|
| Debug | ~6,7 MB | có gỡ lỗi WebView, dùng để phát triển |
| **Release** | **~1,7 MB** | R8 rút gọn mã và tài nguyên |

R8 đổi tên lớp nên đừng kiểm tra bằng cách tìm tên trong file `.dex` — đó là phép thử sai. Tra
`android/app/build/outputs/mapping/release/mapping.txt` mới đúng; ở đó thấy 710 lớp ML Kit vẫn còn,
`TextRecognition` chỉ bị đổi tên thành `i2.b`.

### Ký bản phát hành

Khoá ký **không nằm trong repo** và tôi không tạo hộ — mất khoá là không bao giờ cập nhật được app nữa
nếu đã lên Play Store, nên nó phải là của bạn.

```bash
keytool -genkeypair -v -keystore android/xaxi-release.jks   -keyalg RSA -keysize 4096 -validity 10000 -alias xaxi
```

Rồi chép `android-keystore.example.properties` thành `android/keystore.properties` và điền mật khẩu.
Có tệp đó thì `npm run android:release` tự ký; không có thì vẫn build được nhưng APK chưa ký.

`android/keystore.properties`, `*.jks`, `*.keystore` đều đã nằm trong `.gitignore`.

**Sao lưu tệp `.jks` và mật khẩu ra ngoài máy này.** Đây là thứ duy nhất trong dự án không tái tạo được.

### Mã native

Thư mục `android/` bị Capacitor sinh lại mỗi lần đồng bộ nên không commit được. Nguồn thật nằm ở
`android-native/` và được `scripts/sync-native.mjs` chép đè sau mỗi lần `cap sync`, kèm việc tự thêm
phụ thuộc vào `build.gradle`, khai báo manifest, và cấu hình ký số.

| Plugin | Việc |
|---|---|
| `OcrPlugin` | đọc chữ từ ảnh bằng ML Kit, không mở camera, không xin quyền camera |
| `VoicePlugin` | đọc chính tả, ưu tiên nhận dạng ngay trên máy |
| `ShellPlugin` | rung phản hồi, màu thanh trạng thái theo chủ đề |

### Về quyền

`scripts/patch-android-manifest.mjs` **chặn build** nếu manifest xuất hiện bất kỳ quyền nào thuộc danh
sách cấm (`READ_SMS`, `RECEIVE_SMS`, `BIND_NOTIFICATION_LISTENER_SERVICE`, `BIND_ACCESSIBILITY_SERVICE`,
`PACKAGE_USAGE_STATS`). Kiểm chứng trên máy thật bằng `adb shell dumpsys package com.mittohoa.xaxi_wallet`:

```
requested permissions:
  android.permission.INTERNET
  android.permission.RECORD_AUDIO      <- granted=false, chỉ hỏi lúc bấm micro
  android.permission.ACCESS_NETWORK_STATE
```

Không có quyền CAMERA — ảnh do app camera của hệ thống chụp hộ qua `<input type="file" capture>`.

## iOS (bật sau)

Cấu hình Capacitor và bộ icon iOS đã có sẵn. Khi có máy macOS: `npx cap add ios`, không phải sửa code web.

---

## Cấu trúc

```
src/
  db/db.ts           lược đồ IndexedDB (Dexie) + dữ liệu mặc định
  types.ts           kiểu dữ liệu dùng chung
  store.tsx          context + truy vấn trực tiếp (live query) + chủ đề sáng/tối
  lib/
    format.ts        tiền tệ VND, đọc cách gõ tắt (35k, 1.2tr)
    date.ts          kỳ kế toán, nhãn ngày tháng tiếng Việt
    quickadd.ts      đọc một dòng văn bản thành giao dịch
    receipt.ts       đọc biên lai / tin nhắn biến động số dư
    statement.ts     đọc sao kê CSV, nhận cột, chống trùng
    coverage.ts      độ phủ dữ liệu, phát hiện ngày trống
    recurring.ts     sinh giao dịch định kỳ đến hạn
    actions.ts       ghi giao dịch, đối soát, phím tắt tự học
    stats.ts         tổng hợp số liệu cho báo cáo
    backup.ts        sao lưu JSON, xuất CSV
    ask.ts           tầng trợ lý: phân loại ý định + trả lời câu hỏi
    learn.ts         phân loại tự học + phát hiện khoản định kỳ (chạy trên máy)
    xlsx.ts          đọc Excel không cần thư viện ngoài
    timerange.ts     đọc 'tuần này', 'tháng 8', '7 ngày qua'
    demo.ts          sinh dữ liệu mẫu 3 tháng để dùng thử
  components/        ô trả lời, biên lai, đối soát, sao kê, biểu đồ
  pages/Console.tsx  màn hình duy nhất — ô nhập làm tất cả
  pages/             Ngân sách · Báo cáo · Lịch sử · Cài đặt (mở bằng lệnh)
tests/               96 test: phần lõi, bộ hiểu, và tích hợp trên jsdom
```

## Về biểu đồ

Bảng màu (thu `#2a78d6` / chi `#e34948`, và bộ tương ứng cho nền tối) đã qua kiểm định tương phản và phân biệt
được với các dạng mù màu. Biểu đồ luôn kèm chú giải, có tooltip, và có chế độ xem dạng bảng cho người dùng trình
đọc màn hình.
