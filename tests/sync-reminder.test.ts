/**
 * Nhắc đồng bộ — nửa còn lại của quyết định "bấm nút, không tự động".
 *
 * Một lời nhắc sai chỗ tệ hơn là không nhắc: nhắc lúc không có gì mới là dạy
 * người dùng bỏ qua lời nhắc, rồi họ bỏ qua luôn lần thật sự cần.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { syncReminder } from '../src/lib/sync/reminder'

const NGAY = 86_400_000
const NAY = 1_800_000_000_000

test('chưa bao giờ đồng bộ thì không nhắc', () => {
  // Người dùng chưa chọn dùng tính năng này — nhắc là chào hàng, không phải giúp
  assert.equal(syncReminder(undefined, [NAY], NAY), null)
})

test('mới đồng bộ hôm qua thì không nhắc', () => {
  assert.equal(syncReminder(NAY - NGAY, [NAY], NAY), null)
})

test('để lâu NHƯNG không có gì mới thì không nhắc', () => {
  const cu = NAY - 30 * NGAY
  assert.equal(syncReminder(cu, [cu - NGAY, cu - 2 * NGAY], NAY), null)
})

test('để lâu và có khoản mới thì nhắc, kèm số lượng', () => {
  const cu = NAY - 10 * NGAY
  const r = syncReminder(cu, [cu - NGAY, cu + NGAY, cu + 2 * NGAY], NAY)
  assert.deepEqual(r, { days: 10, pending: 2 })
})

test('đúng bảy ngày là mốc bắt đầu nhắc', () => {
  const sau = NAY - 6 * NGAY
  assert.equal(syncReminder(sau, [NAY], NAY), null, 'sáu ngày thì chưa')
  const bay = NAY - 7 * NGAY
  assert.equal(syncReminder(bay, [NAY], NAY)?.days, 7, 'bảy ngày thì nhắc')
})

test('không có giao dịch nào thì không nhắc', () => {
  assert.equal(syncReminder(NAY - 30 * NGAY, [], NAY), null)
})
