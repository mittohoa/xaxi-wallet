/**
 * Bộ màu danh mục.
 *
 * VÌ SAO NẰM Ở ĐÂY CHỨ KHÔNG PHẢI TRONG tokens.css: màu của một danh mục là
 * DỮ LIỆU, không phải kiểu dáng. Nó được ghi vào CSDL lúc tạo danh mục và đi
 * theo bản ghi đó — người dùng đổi tên danh mục thì màu vẫn giữ. CSS không bao
 * giờ đọc tới nó; mọi chỗ dùng đều lấy từ `category.color`.
 *
 * Tám sắc, sinh bằng công thức trong không gian OKLCH rồi đo bằng bộ kiểm
 * palette, không chọn bằng mắt:
 *
 *   L 0,66 · C 0,13   nằm trong dải độ sáng của CẢ chế độ sáng lẫn tối
 *   loạn sắc          hai màu cạnh nhau cách nhau thấp nhất ΔE 12,1 (protan)
 *   mắt thường        thấp nhất ΔE 16,6
 *   tương phản        ≥ 3:1 trên nền mực và nền thẻ tối
 *
 * Trên nền thẻ TRẮNG thì hai sắc xanh lá và ngọc rơi xuống 2,94–2,96 — dưới
 * 3:1 một chút. Bộ kiểm gọi đó là mức phải có "cứu trợ" chứ không phải cấm, và
 * cứu trợ đã có sẵn: mỗi hàng danh mục luôn kèm biểu tượng, tên và con số, cộng
 * một lối xem dạng bảng trong Báo cáo. Màu ở đây là thứ giúp nhìn nhanh, không
 * phải thứ mang nghĩa một mình.
 *
 * Bộ cũ ('#eb6834', '#2a78d6', '#52514e'…) trượt phép kiểm: '#52514e' đọc ra
 * xám (độ bão hoà 0,005), và '#e34948' với '#e87ba4' chỉ cách nhau ΔE 13,2 nên
 * mắt thường cũng khó phân biệt.
 */

/** Tám sắc cho danh mục thật của người dùng */
export const CATEGORY_COLORS = [
  '#73a434', // xanh lá
  '#2b99e7', // lam
  '#db703b', // cam
  '#a17adf', // tím
  '#ac9008', // vàng
  '#03aa8e', // ngọc
  '#6f8bed', // chàm
  '#d4679f', // hồng
] as const

/**
 * Màu cho danh mục HỆ THỐNG — "Chi khác", "Chưa rõ", "Chuyển đi".
 *
 * Cố ý xám: chúng không phải khoản chi có ý nghĩa mà là chỗ rót về. Cho chúng
 * một sắc rực rỡ thì trong biểu đồ chúng trông ngang hàng với những danh mục
 * người dùng thật sự quan tâm, và còn chiếm mất một sắc của bộ tám.
 */
export const SYSTEM_COLOR = '#8a929d'

/** Màu kế tiếp khi người dùng thêm danh mục mới, xoay vòng theo số đã có */
export function nextCategoryColor(existingCount: number): string {
  return CATEGORY_COLORS[existingCount % CATEGORY_COLORS.length]
}
