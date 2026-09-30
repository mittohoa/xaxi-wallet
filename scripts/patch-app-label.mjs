/**
 * Đặt nhãn app hiện dưới biểu tượng và trong bảng Chia sẻ.
 *
 * VÌ SAO CẦN RIÊNG MỘT BƯỚC: Capacitor sinh `strings.xml` đúng một lần lúc
 * `cap add android` và KHÔNG cập nhật lại khi sync. Nên đổi `appName` trong
 * `capacitor.config.ts` là chưa đủ — nhãn cũ nằm lại mãi trong thư mục
 * `android/`, mà thư mục đó thì gitignore nên không ai thấy nó đã lệch.
 *
 * VÌ SAO TÊN LÀ "Ví XAXI": trên máy phát triển này có hai app đều tên "XAXI",
 * và trong bảng Chia sẻ thì không cách nào phân biệt. Thêm chữ "Ví" vừa đúng
 * nghĩa (mã gói vốn là `xaxi_wallet`), vừa xếp app xuống chữ V — cách hẳn khỏi
 * "XAXI" trong mọi danh sách sắp theo bảng chữ cái, chứ không chỉ khác tên.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const APP_LABEL = 'Ví XAXI'

/** Các khoá chuỗi mang nhãn app trong strings.xml do Capacitor sinh */
const KEYS = ['app_name', 'title_activity_main']

/**
 * @param {string} target thư mục android/ đã sinh
 * @returns {string[]} danh sách thay đổi, rỗng nghĩa là đã đúng sẵn
 */
export function patchAppLabel(target) {
  const path = join(target, 'app', 'src', 'main', 'res', 'values', 'strings.xml')
  if (!existsSync(path)) return []

  let text = readFileSync(path, 'utf8')
  const changes = []

  for (const key of KEYS) {
    const re = new RegExp(`(<string name="${key}">)([^<]*)(</string>)`)
    const m = text.match(re)
    if (m && m[2] !== APP_LABEL) {
      text = text.replace(re, `$1${APP_LABEL}$3`)
      changes.push(`${key}: "${m[2]}" → "${APP_LABEL}"`)
    }
  }

  if (changes.length > 0) writeFileSync(path, text, 'utf8')
  return changes
}
