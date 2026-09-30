/**
 * Nhắc đồng bộ.
 *
 * §3.6 để ngỏ câu hỏi "tự động hay bấm nút", với lý do: tự động thì tốn pin và
 * dễ gây bất ngờ, bấm nút thì lại quên.
 *
 * Câu trả lời đã chốt là **bấm nút**, và không phải vì pin. Đồng bộ tự động đòi
 * một chỗ chứa mà app tự tới được — tức một tài khoản, một client id nhúng sẵn,
 * và quyền ra mạng. Đó đúng là những thứ app hứa không có. "Bấm nút" không phải
 * một sự nhân nhượng, nó là hệ quả của việc không có máy chủ.
 *
 * Nhưng nửa sau của câu hỏi — "thì lại quên" — là thật. Tệp này trả lời nửa đó:
 * đã đồng bộ thì nhắc, chỉ khi có thứ ĐÁNG đồng bộ.
 */

/** Để lâu hơn ngần này ngày thì nhắc */
const NHAC_SAU_NGAY = 7

export interface SyncReminder {
  /** số ngày kể từ lần đồng bộ cuối */
  days: number
  /** số giao dịch ghi sau lần đồng bộ cuối */
  pending: number
}

/**
 * @param lastSyncAt mốc lần đồng bộ cuối; thiếu nghĩa là chưa bật đồng bộ
 * @param updatedAts mốc sửa của mọi giao dịch đang có
 */
export function syncReminder(
  lastSyncAt: number | undefined,
  updatedAts: number[],
  now = Date.now(),
): SyncReminder | null {
  // Chưa bao giờ đồng bộ thì không nhắc: người dùng chưa chọn dùng tính năng này
  if (!lastSyncAt) return null

  const days = Math.floor((now - lastSyncAt) / 86_400_000)
  if (days < NHAC_SAU_NGAY) return null

  /*
   * Chỉ nhắc khi CÓ thay đổi chưa mang đi.
   *
   * Nhắc trong lúc không có gì mới là dạy người dùng bỏ qua lời nhắc, và rồi họ
   * cũng bỏ qua luôn lần thật sự cần.
   */
  const pending = updatedAts.filter((t) => t > lastSyncAt).length
  return pending > 0 ? { days, pending } : null
}
