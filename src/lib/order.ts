/**
 * Thứ tự hiển thị cho ví và danh mục.
 *
 * VẤN ĐỀ: Dexie trả về theo thứ tự KHOÁ CHÍNH, mà khoá chính là UUID — tức là
 * thứ tự ngẫu nhiên. Nó ổn định với một bộ dữ liệu nhất định nên không ai nhận
 * ra ngay, nhưng hậu quả thì có thật:
 *
 *   · lưới chip danh mục trong biểu mẫu xếp lộn xộn, không theo logic nào
 *   · ví mặc định của ô nhập nhanh là một ví bất kỳ, không phải ví hay dùng
 *   · màn hình chuyển tiền có thể mở ra với ví nguồn trùng ví đích
 *
 * Cái cuối lộ ra khi viết phép kiểm trên máy: nút Chuyển bị tắt ngay lúc mở
 * màn hình, vì hai đầu vô tình trùng nhau.
 *
 * CÁCH SỬA: mỗi bản ghi mang một mốc `createdAt`, và mọi chỗ hiển thị đều sắp
 * theo mốc đó. Bản ghi tạo trước đứng trước — đúng thứ tự người dùng tự dựng
 * nên, và không đổi khi họ sửa tên hay sửa màu.
 *
 * Vì sao KHÔNG sắp theo tên: đổi tên một ví sẽ làm nó nhảy chỗ, và ví mặc định
 * của ô nhập nhanh đổi theo — một thao tác vô hại gây ra hệ quả không ai ngờ.
 *
 * Vì sao KHÔNG sắp theo `updatedAt`: sửa một bản ghi sẽ đẩy nó xuống cuối.
 */

export interface Ordered {
  createdAt?: number
  name: string
}

/**
 * So sánh hai bản ghi theo thứ tự hiển thị.
 *
 * Bản ghi chưa có `createdAt` xuống cuối thay vì lên đầu: chúng là dữ liệu cũ
 * chưa qua di trú, và đẩy chúng lên trước sẽ xáo trộn thứ tự người dùng đang
 * quen. So tên làm phép phá thế hoà để kết quả luôn xác định — hai bản ghi
 * cùng mốc không được phép đổi chỗ giữa hai lần mở app.
 */
export function byCreation(a: Ordered, b: Ordered): number {
  const x = a.createdAt ?? Number.MAX_SAFE_INTEGER
  const y = b.createdAt ?? Number.MAX_SAFE_INTEGER
  if (x !== y) return x - y
  return a.name.localeCompare(b.name, 'vi')
}

/** Bản sao đã sắp thứ tự; không đụng vào mảng gốc */
export function ordered<T extends Ordered>(rows: T[]): T[] {
  return [...rows].sort(byCreation)
}
