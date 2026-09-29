/**
 * Cho biết dữ liệu đang được bảo vệ ở mức nào, và xin nâng lên nếu được.
 *
 * Mức độ rủi ro khác nhau hẳn giữa hai nền tảng, nên không được nói chung một
 * câu cho cả hai:
 *
 *   Bản Android (app đóng gói)
 *     IndexedDB nằm trong /data/data/<package>/app_webview/... tức vùng DATA
 *     riêng của ứng dụng, không phải vùng cache. Android dọn dung lượng thì
 *     xoá cache, không đụng tới đây. Dữ liệu chỉ mất khi gỡ app hoặc người
 *     dùng bấm "Xoá dữ liệu".
 *     (`navigator.storage.persist()` vẫn trả false ở WebView vì Chromium
 *     không có tín hiệu "trang đã được cài đặt" để cấp — không phải dấu hiệu
 *     dữ liệu đang bấp bênh.)
 *
 *   Bản web (trình duyệt)
 *     Mặc định là "best-effort": trình duyệt được phép xoá khi máy thiếu
 *     dung lượng, không báo trước. Đây mới là chỗ cần xin chế độ bền vững —
 *     và Chromium thường chỉ cấp sau khi người dùng thêm app vào màn hình
 *     chính hoặc dùng đủ thường xuyên.
 */
import { Capacitor } from '@capacitor/core'

export type StorageProtection =
  /** app đóng gói: nằm trong vùng dữ liệu riêng, hệ thống không tự dọn */
  | 'app-private'
  /** web: đã được trình duyệt cấp chế độ bền vững */
  | 'persisted'
  /** web: có thể bị trình duyệt xoá khi máy thiếu dung lượng */
  | 'best-effort'
  /** không hỏi được tình trạng */
  | 'unknown'

export interface StorageStatus {
  protection: StorageProtection
  /** chỉ có ý nghĩa với bản web — bản đóng gói không cần xin */
  canRequest: boolean
  usageBytes: number
  quotaBytes: number
}

function hasStorageApi(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage !== 'undefined'
}

function isPackagedApp(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export async function readStorageStatus(): Promise<StorageStatus> {
  let usageBytes = 0
  let quotaBytes = 0

  if (hasStorageApi() && typeof navigator.storage.estimate === 'function') {
    try {
      const estimate = await navigator.storage.estimate()
      usageBytes = estimate.usage ?? 0
      quotaBytes = estimate.quota ?? 0
    } catch {
      /* vài WebView không cho hỏi — coi như chưa biết dung lượng */
    }
  }

  if (isPackagedApp()) {
    return { protection: 'app-private', canRequest: false, usageBytes, quotaBytes }
  }

  if (!hasStorageApi() || typeof navigator.storage.persisted !== 'function') {
    return { protection: 'unknown', canRequest: false, usageBytes, quotaBytes }
  }

  const persisted = await navigator.storage.persisted()
  return {
    protection: persisted ? 'persisted' : 'best-effort',
    canRequest: !persisted && typeof navigator.storage.persist === 'function',
    usageBytes,
    quotaBytes,
  }
}

/**
 * Xin chế độ lưu trữ bền vững. Gọi nhiều lần không sao.
 * Với bản đóng gói thì không cần — trả về true luôn vì dữ liệu vốn đã an toàn.
 */
export async function requestPersistence(): Promise<boolean> {
  if (isPackagedApp()) return true
  if (!hasStorageApi() || typeof navigator.storage.persist !== 'function') return false
  try {
    if (typeof navigator.storage.persisted === 'function' && (await navigator.storage.persisted())) return true
    return await navigator.storage.persist()
  } catch {
    // Vài trình duyệt ném lỗi thay vì trả false — coi như chưa được cấp
    return false
  }
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

/** Đổi số byte thành chuỗi đọc được, dùng dấu phẩy thập phân kiểu Việt */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }
  const decimals = unit === 0 ? 0 : value < 10 ? 1 : 0
  return `${value.toFixed(decimals).replace('.', ',')} ${UNITS[unit]}`
}
