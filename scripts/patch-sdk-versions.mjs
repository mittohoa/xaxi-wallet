/**
 * Đặt mức SDK biên dịch và mức SDK đích.
 *
 * VÌ SAO CẦN RIÊNG MỘT BƯỚC: `android/variables.gradle` do Capacitor sinh ra và
 * thư mục `android/` thì gitignore. Sửa tay là mất ngay lần `cap add android`
 * kế tiếp, mà mất trong im lặng — build vẫn chạy, chỉ là app tụt về API cũ và
 * Play từ chối lúc tải lên.
 *
 * VÌ SAO 36: Google Play đòi app nhắm tới một mức API gần đây. Bản Capacitor
 * sinh ra mặc định 34 — hai thế hệ cũ, và bị chặn ngay ở bước tải lên.
 *
 * minSdk GIỮ 22: đó là mức sàn của thiết bị chạy được, không liên quan tới yêu
 * cầu của Play. Nâng nó lên là cắt bỏ mọi máy Android cũ, kể cả máy thử đang
 * dùng.
 *
 * ĐIỀU targetSdk 36 KÉO THEO: từ API 35 Android ép edge-to-edge — nội dung tràn
 * xuống dưới thanh trạng thái và thanh điều hướng, và `setStatusBarColor()`
 * thành hàm rỗng. App đã sẵn sàng nhờ `viewport-fit=cover` và `env(safe-area-
 * inset-*)`, nhưng màu BIỂU TƯỢNG trên thanh hệ thống thì phải tự lo — xem
 * `applyTheme` trong ShellPlugin.java.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const COMPILE_SDK = 36
export const TARGET_SDK = 36

/**
 * @param {string} target thư mục android/ đã sinh
 * @returns {string[]} danh sách thay đổi, rỗng nghĩa là đã đúng sẵn
 */
export function patchSdkVersions(target) {
  const path = join(target, 'variables.gradle')
  if (!existsSync(path)) return []

  let text = readFileSync(path, 'utf8')
  const changes = []

  for (const [key, want] of [
    ['compileSdkVersion', COMPILE_SDK],
    ['targetSdkVersion', TARGET_SDK],
  ]) {
    const re = new RegExp(`(${key}\\s*=\\s*)(\\d+)`)
    const m = text.match(re)
    if (m && Number(m[2]) !== want) {
      text = text.replace(re, `$1${want}`)
      changes.push(`${key}: ${m[2]} → ${want}`)
    }
  }

  if (changes.length > 0) writeFileSync(path, text, 'utf8')
  return changes
}
