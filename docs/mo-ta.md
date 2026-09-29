CapMoney
Ứng dụng quản lý tài chính cá nhân thuần HTML/CSS/JavaScript, tối ưu cho GitHub Pages và iPhone. Dữ liệu có thể chạy hoàn toàn cục bộ hoặc đồng bộ qua Google Apps Script, Google Sheets và Google Drive.

Chức năng
Tổng quan số dư, thu nhập, chi tiêu và giao dịch theo chu kỳ tài chính tùy chỉnh.
Đăng ký, đăng nhập và đăng xuất cục bộ; mật khẩu được dẫn xuất bằng PBKDF2, dữ liệu tách riêng theo tài khoản trên thiết bị.
Mốc chu kỳ từ ngày 1–31. Ví dụ chọn ngày 19 thì kỳ hiện tại là ngày 19 tháng này đến ngày 18 tháng sau.
Danh sách và lịch giao dịch, tìm kiếm, lọc tài khoản/loại/danh mục.
Trang chủ có hai chế độ bấm lặp: Ngày luân phiên thư viện ảnh/danh sách; Tháng luân phiên lịch ảnh/danh sách/lịch số tiền.
Có thể chạm trực tiếp vào ngày hoặc khoảng chu kỳ ở giữa hai nút trước/sau để mở lịch và nhảy tới ngày cần xem.
Chế độ lịch ảnh dùng ảnh capture thật của giao dịch; ảnh đã đồng bộ được tải riêng tư từ thư mục Drive qua Apps Script. Giao dịch cũ chưa có ảnh dùng thumbnail thay thế.
Thêm, sửa, xóa, nhập CSV/JSON và xuất CSV/JSON.
Nhận OCR từ iOS Shortcut, phát hiện số tiền, thu/chi, tự gán danh mục và chống trùng.
Quy tắc phân loại tùy chỉnh theo từ khóa.
Báo cáo theo chu kỳ, khoảng ngày tùy chọn hoặc từng tháng của một năm, kèm xu hướng 6 chu kỳ.
Biểu đồ vòng hiển thị tên danh mục, phần trăm và đường dẫn nhãn; rê chuột/chạm vào lát cắt để xem số tiền.
Chạm dòng chi tiết danh mục để xem các giao dịch có ảnh, số tiền và ngày, sắp xếp mới nhất trước.
Mỗi giao dịch có thể dùng icon riêng từ danh sách emoji hoặc bàn phím emoji của điện thoại.
Ví tiền mặt, ngân hàng, tiết kiệm, khoản vay và đầu tư.
Chuyển tiền giữa tài khoản bằng cặp giao dịch liên kết.
Ngân sách theo từng chu kỳ tài chính.
Mục tiêu tiết kiệm.
Giao dịch định kỳ.
Nhóm, chia tiền và giao dịch chia sẻ.
Giao diện sáng/tối, màu chủ đạo, ẩn số tiền và nhắc hằng ngày.
PWA, cache offline và hàng đợi đồng bộ.
Mô hình local-first: hồ sơ và giao dịch nằm trong IndexedDB; ảnh nén được lưu dạng Blob trên iPhone.
Không tự gửi dữ liệu khi mở app hoặc khi mạng trở lại. Google chỉ được gọi khi người dùng bấm Đồng bộ hoặc Kiểm tra kết nối.
Trang Dữ liệu hiển thị dung lượng, xin chế độ lưu trữ bền vững, dọn ảnh đã có trên Drive và xuất JSON kèm ảnh vào Files.
Backend Apps Script tự tạo cấu trúc Sheets và thư mục ảnh trên Drive.