/**
 * Dò công cụ Android trên máy đang chạy.
 *
 * Tách riêng vì hai script cần chung: bộ gọi Gradle và bộ rà trên thiết bị.
 *
 * Nguyên tắc chung của tệp này: KHÔNG tin biến môi trường, và KHÔNG tin tên
 * thư mục. Build phụ thuộc vào biến môi trường có sẵn nghĩa là nó chạy được
 * trên máy này và hỏng trên máy khác mà không ai biết vì sao.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export const isWindows = process.platform === 'win32'
const exe = (name) => (isWindows ? `${name}.exe` : name)

/* ---------------- JDK ---------------- */

const isJdk = (dir) => existsSync(join(dir, 'bin', exe('java')))

/**
 * Đọc phiên bản chính từ chính trình java.
 *
 * Không tin tên thư mục: trên máy thật có thư mục `jbr` đủ cả `bin/java.exe`
 * nhưng thiếu `lib/jvm.cfg` — chạy lên là lỗi. Hỏi thật thì loại được ngay.
 */
function majorVersion(dir) {
  const out = spawnSync(join(dir, 'bin', exe('java')), ['-version'], { encoding: 'utf8' })
  const m = `${out.stdout ?? ''}${out.stderr ?? ''}`.match(/version "(\d+)/)
  return m ? Number(m[1]) : 0
}

/**
 * Tìm một JDK 17 trở lên.
 *
 * Android Gradle Plugin đòi Java 17; nhiều máy Windows lại có JDK 11 đứng trước
 * trong PATH, và lỗi chỉ hiện giữa chừng lúc build chứ không lúc cài đặt.
 *
 * Dùng dấu gạch xuôi kể cả trên Windows: Node hiểu cả hai, còn dấu gạch ngược
 * trong chuỗi JavaScript là ký tự thoát, rất dễ viết sai mà không báo lỗi.
 */
export function findJdk() {
  const seen = []
  if (process.env.JAVA_HOME && isJdk(process.env.JAVA_HOME)) seen.push(process.env.JAVA_HOME)

  const parents = isWindows
    ? [
        'C:/Program Files/Eclipse Adoptium',
        'C:/Program Files/Java',
        'C:/Program Files/Microsoft',
        'C:/Program Files/Android',
        'C:/Program Files/JetBrains',
      ]
    : ['/usr/lib/jvm', '/Library/Java/JavaVirtualMachines', '/opt/homebrew/opt', '/Applications']

  for (const parent of parents) {
    if (!existsSync(parent)) continue
    for (const entry of readdirSync(parent)) {
      const dir = join(parent, entry)
      // Bản cài trực tiếp, JDK đi kèm IDE, và kiểu bố cục của macOS
      for (const nested of [dir, join(dir, 'jbr'), join(dir, 'Contents', 'Home'), join(dir, 'Contents', 'jbr', 'Contents', 'Home')]) {
        if (isJdk(nested)) seen.push(nested)
      }
    }
  }

  return seen
    .map((dir) => ({ dir, major: majorVersion(dir) }))
    .filter((d) => d.major >= 17)
    .sort((a, b) => a.major - b.major)[0]?.dir
}

/* ---------------- SDK ---------------- */

/**
 * Tìm thư mục Android SDK.
 *
 * Cùng lý do với findJdk: thư mục android/ được sinh lại mỗi lần `cap sync` nên
 * local.properties không tồn tại lâu, và thiếu nó thì Gradle báo lỗi ở giữa
 * chừng build chứ không báo lúc bắt đầu.
 */
export function findSdk() {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? ''
  return [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : null,
    home ? join(home, 'Library', 'Android', 'sdk') : null,
    home ? join(home, 'Android', 'Sdk') : null,
  ]
    .filter(Boolean)
    .find((c) => existsSync(join(c, 'platform-tools')))
}

/* ---------------- adb ---------------- */

export function adbPath() {
  const sdk = findSdk()
  if (!sdk) return null
  const p = join(sdk, 'platform-tools', exe('adb'))
  return existsSync(p) ? p : null
}

/** Gọi adb, trả về chuỗi đã cắt khoảng trắng hai đầu */
export function adb(args, { quiet = true } = {}) {
  const bin = adbPath()
  if (!bin) throw new Error('Không tìm thấy adb. Cài Android SDK platform-tools hoặc đặt ANDROID_HOME.')
  const out = spawnSync(bin, args, { encoding: 'utf8' })
  if (out.error) throw out.error
  if (!quiet && out.stderr?.trim()) console.error(out.stderr.trim())
  return `${out.stdout ?? ''}`.trim()
}

/** Mã của thiết bị duy nhất đang nối, hoặc null */
export function connectedDevice() {
  const lines = adb(['devices'])
    .split('\n')
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l.endsWith('\tdevice'))
  return lines.length === 1 ? lines[0].split('\t')[0] : null
}
