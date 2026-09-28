# XAXI — Quản lý thu chi cá nhân

Một codebase, chạy trên web (GitHub Pages), Windows, Android; macOS và Linux bật sau mà không phải sửa code.

Dữ liệu nằm hoàn toàn trên thiết bị (IndexedDB). Không tài khoản, không máy chủ, không quảng cáo.

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
npm test           # 31 test: phần lõi + render thật app trên jsdom
npm run build      # xuất ra dist/
```

Lần đầu mở app sẽ trống. Để xem app trông thế nào khi đã dùng vài tháng:
*Cài đặt → Dữ liệu → **Nạp dữ liệu mẫu*** (3 tháng chi tiêu, có sẵn ngày trống, khoản chờ phân loại và một bút toán đối soát để bạn thử các cơ chế).

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

Cần cài thêm: **JDK 17+** (máy này đang là JDK 11) và **Android Studio** (SDK + platform-tools).

```bash
npx cap add android      # chỉ chạy một lần
npm run android:open     # build web, đồng bộ, mở Android Studio
npm run android:build    # xuất APK release
```

Để app nhận được nội dung từ menu *Chia sẻ* của Android, thêm intent-filter sau vào
`android/app/src/main/AndroidManifest.xml` trong thẻ `<activity>` chính:

```xml
<intent-filter>
  <action android:name="android.intent.action.SEND" />
  <category android:name="android.intent.category.DEFAULT" />
  <data android:mimeType="text/plain" />
</intent-filter>
```

App **không** khai báo quyền `READ_SMS`, `RECEIVE_SMS` hay `BIND_NOTIFICATION_LISTENER_SERVICE` — và không nên thêm.

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
    demo.ts          sinh dữ liệu mẫu 3 tháng để dùng thử
  components/        ô ghi nhanh, lấp khoảng trống, biên lai, đối soát, sao kê, biểu đồ
  pages/             Tổng quan · Giao dịch · Ngân sách · Báo cáo · Cài đặt
tests/               31 test: phần lõi + tích hợp trên jsdom
```

## Về biểu đồ

Bảng màu (thu `#2a78d6` / chi `#e34948`, và bộ tương ứng cho nền tối) đã qua kiểm định tương phản và phân biệt
được với các dạng mù màu. Biểu đồ luôn kèm chú giải, có tooltip, và có chế độ xem dạng bảng cho người dùng trình
đọc màn hình.
