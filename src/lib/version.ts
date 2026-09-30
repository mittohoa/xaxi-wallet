/**
 * Số hiệu bản dựng, đọc an toàn ở mọi nơi.
 *
 * `__APP_VERSION__` là biến do **Vite** thay lúc build. Dùng thẳng nó trong
 * thành phần giao diện thì mọi bộ đóng gói khác đều vỡ — bộ chạy kiểm dùng
 * esbuild không biết biến đó, và màn hình Cài đặt ném `ReferenceError` ngay khi
 * render. Bài kiểm "mọi lệnh đều mở được màn hình của nó" bắt được đúng điều
 * này, nhưng chỉ vì nó có đi qua màn hình Cài đặt.
 *
 * `typeof` trên một tên chưa khai báo là an toàn trong JavaScript — đó là cách
 * duy nhất hỏi "biến này có tồn tại không" mà không ném lỗi.
 */
export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' && __APP_VERSION__ ? __APP_VERSION__ : 'bản chạy thử'
