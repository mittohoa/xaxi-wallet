/**
 * Bộ biểu tượng vector của giao diện.
 *
 * VÌ SAO KHÔNG DÙNG EMOJI CHO GIAO DIỆN
 *
 * Emoji do hệ điều hành vẽ, không phải app. Cùng một ký tự ⚙️ ra bốn hình khác
 * nhau trên Samsung, Windows, macOS và Tauri — nên một bộ thiết kế kiểm soát
 * từng token màu lại để hệ điều hành chọn hộ hình dạng của chính nút bấm.
 *
 * Nặng hơn: emoji là hình nhiều màu cố định. Chúng không nghe theo `currentColor`,
 * nên không đổi theo nền sáng/tối, không nhạt đi khi nút bị khoá, và đâm thẳng
 * vào bộ tám màu đã đo đạc kỹ ở `lib/palette.ts`.
 *
 * Và một lỗi âm thầm đã có sẵn trong mã: những ký tự như ⚠ ⬇ ⬆ 🗜 KHÔNG kèm dấu
 * chọn kiểu hiển thị, nên nền tảng tự quyết vẽ chúng thành chữ đen trắng hay
 * thành emoji nhiều màu. Kết quả là trên cùng một màn hình Cài đặt, có biểu
 * tượng ra đen trắng còn biểu tượng ngay bên cạnh ra đầy màu — tuỳ máy.
 *
 * NHỮNG CHỖ VẪN GIỮ EMOJI, CÓ CHỦ ĐÍCH
 *
 * Biểu tượng danh mục, mục tiêu và sáu hũ là DỮ LIỆU: người dùng tự gõ emoji họ
 * thích, và nó nằm trong IndexedDB. Đổi sang vector nghĩa là lấy mất quyền chọn
 * đó và phải di trú dữ liệu cũ. Emoji đúng cho chỗ đó.
 *
 * Ranh giới vì vậy là: emoji cho thứ người dùng chọn, vector cho thứ app vẽ.
 *
 * Có một chỗ bị ép giữ emoji vì lý do kỹ thuật chứ không phải vì thiết kế: biểu
 * tượng loại ví nằm trong thẻ `<option>` của trình duyệt, mà `<option>` chỉ nhận
 * chữ — không vẽ được SVG bên trong. Đổi chỗ đó sang vector thì danh sách xổ
 * xuống mất hẳn biểu tượng.
 *
 * CÁCH VẼ
 *
 * Nét chứ không tô đặc, lưới 24, `currentColor`, cỡ theo `1em` — nên biểu tượng
 * tự ăn theo cỡ chữ và màu của phần tử chứa nó. Không có màu nào viết cứng.
 */
import type { ReactElement } from 'react'

const S = 24

/**
 * Hình của từng biểu tượng.
 *
 * Toạ độ trên lưới 24×24, chỉ dùng nét. Không có `fill` và không có `stroke`
 * trong từng hình — cả hai do thẻ `<svg>` bọc ngoài đặt một lần, để không hình
 * nào lỡ tay viết cứng một màu.
 */
const PATHS = {
  /* ── thao tác ───────────────────────────────────────────── */
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  back: <path d="M19.5 12h-15M10.5 6l-6 6 6 6" />,
  enter: (
    <>
      <path d="M20 5.5v5a3.5 3.5 0 0 1-3.5 3.5H4.5" />
      <path d="M9 9.5L4.5 14 9 18.5" />
    </>
  ),
  swap: (
    <>
      <path d="M7.5 20V4.5M4 8l3.5-3.5L11 8" />
      <path d="M16.5 4v15.5M13 16l3.5 3.5L20 16" />
    </>
  ),
  up: <path d="M12 19.5V5M6 11l6-6 6 6" />,
  down: <path d="M12 4.5V19M6 13l6 6 6-6" />,

  /* ── vào / ra dữ liệu ───────────────────────────────────── */
  download: (
    <>
      <path d="M12 3.5v11M7.5 10L12 14.5 16.5 10" />
      <path d="M4 19.5h16" />
    </>
  ),
  upload: (
    <>
      <path d="M12 14.5v-11M7.5 8L12 3.5 16.5 8" />
      <path d="M4 19.5h16" />
    </>
  ),
  file: (
    <>
      <path d="M6.5 3.5h7l4.5 4.5v12a1 1 0 0 1-1 1h-10.5a1 1 0 0 1-1-1v-15.5a1 1 0 0 1 1-1z" />
      <path d="M13.5 3.5V8H18" />
    </>
  ),
  archive: (
    <>
      <path d="M3.5 6.5h17v4h-17z" />
      <path d="M5.5 10.5v9a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-9" />
      <path d="M10 14.5h4" />
    </>
  ),

  /*
   * Chỉ có một biểu tượng ví: `bank`, cho nút nhập sao kê.
   *
   * Bốn loại ví còn lại (tiền mặt, ví điện tử, thẻ, tiết kiệm) hiện ra trong
   * thẻ `<option>` của danh sách xổ xuống, mà `<option>` không vẽ được SVG. Vẽ
   * sẵn bốn hình nữa rồi để đó là mã chết — có bài kiểm canh đúng điều này.
   */
  bank: (
    <>
      <path d="M3.5 9.5L12 4l8.5 5.5" />
      <path d="M3.5 20.5h17" />
      <path d="M6.5 12v5.5M10 12v5.5M14 12v5.5M17.5 12v5.5" />
    </>
  ),

  /* ── còn lại ────────────────────────────────────────────── */
  /*
   * Răng phẳng, không nhọn. Bản đầu vẽ tám mũi nhọn quanh một vòng tròn, và
   * phóng to lên thì nó ra hình mặt trời chứ không phải bánh răng. Toạ độ dưới
   * đây tính bằng toạ độ cực: tám răng đều nhau, đỉnh răng là một đoạn thẳng
   * chứ không phải một điểm.
   */
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M10.17 6.18L10.21 3.18L13.79 3.18L13.83 6.18L14.82 6.59L16.97 4.5L19.5 7.03L17.41 9.18L17.82 10.17L20.82 10.21L20.82 13.79L17.82 13.83L17.41 14.82L19.5 16.97L16.97 19.5L14.82 17.41L13.83 17.82L13.79 20.82L10.21 20.82L10.17 17.82L9.18 17.41L7.03 19.5L4.5 16.97L6.59 14.82L6.18 13.83L3.18 13.79L3.18 10.21L6.18 10.17L6.59 9.18L4.5 7.03L7.03 4.5L9.18 6.59Z" />
    </>
  ),
  calendar: (
    <>
      <path d="M3.5 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <path d="M3.5 10h17" />
      <path d="M8 3v4M16 3v4" />
    </>
  ),
  camera: (
    <>
      <path d="M3.5 9.5a2 2 0 0 1 2-2h2l1.5-2.5h6L16.5 7.5h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  mic: (
    <>
      <path d="M9 5.5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0z" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </>
  ),
  stop: <path d="M6.5 7.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" />,
  repeat: (
    <>
      <path d="M17 2.5l3 3-3 3" />
      <path d="M20 5.5H8.5A4.5 4.5 0 0 0 4 10v1" />
      <path d="M7 21.5l-3-3 3-3" />
      <path d="M4 18.5h11.5A4.5 4.5 0 0 0 20 14v-1" />
    </>
  ),
  receipt: (
    <>
      <path d="M5.5 3.5h13v17l-2.2-1.6-2.2 1.6-2.1-1.6-2.2 1.6-2.3-1.6z" />
      <path d="M9 8.5h6M9 12.5h6" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  chart: (
    <>
      <path d="M3.5 20.5h17" />
      {/* Cột cách đều và cân giữa trục; bản đầu lệch sang trái một đơn vị */}
      <path d="M7 20.5v-6M12 20.5v-13M17 20.5v-9" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3.8l9 15.7H3z" />
      <path d="M12 9.8v4.2" />
      <path d="M12 17.2h.01" />
    </>
  ),
} as const

export type IconName = keyof typeof PATHS

/** Danh sách tên, để bài kiểm duyệt được mà không phải đọc lại tệp này */
export const ICON_NAMES = Object.keys(PATHS) as IconName[]

/**
 * `label` chỉ đặt khi biểu tượng ĐỨNG MỘT MÌNH thay cho chữ.
 *
 * Mặc định là `aria-hidden`, vì gần như mọi chỗ đều có nhãn chữ ngay bên cạnh —
 * đọc lại tên biểu tượng ở đó chỉ làm trình đọc màn hình nói thừa.
 */
export function Icon({
  name,
  label,
  className,
}: {
  name: IconName
  label?: string
  className?: string
}): ReactElement {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      viewBox={`0 0 ${S} ${S}`}
      // Cỡ theo chữ, không phải theo pixel: biểu tượng tự lớn nhỏ cùng phần tử
      // chứa nó, kể cả khi người dùng phóng to cỡ chữ của hệ thống.
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
