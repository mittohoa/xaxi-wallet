/**
 * Bất biến của thang chia biểu đồ.
 *
 * Một biểu đồ vẽ sai không báo lỗi, không làm hỏng bài kiểm nào khác, và trên
 * màn hình thì vẫn ra một hình đẹp đẽ. Người dùng chỉ đơn giản đọc ra con số
 * sai. Nên thang chia phải có bài kiểm riêng.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { niceTicks } from '../src/components/charts'

/**
 * Bài kiểm quan trọng nhất của tệp này.
 *
 * Bản cũ dừng vòng lặp ở `v <= max`, nên vạch trên cùng thường NHỎ HƠN giá trị
 * lớn nhất: với 18 triệu và bước 5 triệu thì trần là 15 triệu, cột cao 120%
 * vùng vẽ và phần ngọn bị mép SVG cắt mất.
 *
 * Hậu quả không phải xấu hình mà là SAI SỐ LIỆU: 16 triệu và 18 triệu đều tràn
 * ra ngoài nên vẽ ra cao bằng nhau, và người đọc không có cách nào nhận ra.
 */
test('vạch trên cùng luôn chứa được giá trị lớn nhất', () => {
  const tran = (max: number) => {
    const t = niceTicks(max)
    return t[t.length - 1]
  }

  // Những con số đã làm lộ ra lỗi trên máy thật
  for (const max of [18_000_000, 16_000_000, 22_000_000, 9_000_000, 350_000]) {
    assert.ok(tran(max) >= max, `${max} tràn ra ngoài: trần chỉ có ${tran(max)}`)
  }

  // Và quét rộng, vì lỗi cũ chỉ tha cho những số rơi đúng vào một vạch
  for (let n = 1; n <= 3000; n++) {
    const max = n * 7919 // số nguyên tố, để không vô tình toàn số tròn
    assert.ok(tran(max) >= max, `${max} tràn ra ngoài: trần chỉ có ${tran(max)}`)
  }
})

test('trần không nới rộng quá một bước — thang chia vẫn phải sát dữ liệu', () => {
  for (let n = 1; n <= 500; n++) {
    const max = n * 1237
    const t = niceTicks(max)
    const buoc = t.length > 1 ? t[1] - t[0] : t[0]
    const tran = t[t.length - 1]
    assert.ok(tran - max < buoc, `${max}: trần ${tran} thừa hẳn một bước (${buoc})`)
  }
})

test('giá trị rơi đúng vào một vạch thì không nới thêm', () => {
  // 15 triệu với bước 5 triệu: cột chạm đúng vạch trên cùng, không cần khoảng hở
  const t = niceTicks(15_000_000)
  assert.equal(t[t.length - 1], 15_000_000)
})

test('vạch bắt đầu từ 0 và tăng đều', () => {
  const t = niceTicks(18_000_000)
  assert.equal(t[0], 0)
  const buoc = t[1] - t[0]
  for (let i = 1; i < t.length; i++) {
    assert.ok(Math.abs(t[i] - t[i - 1] - buoc) < 1e-6, 'khoảng cách giữa các vạch phải đều')
  }
})

test('không có dữ liệu thì không vỡ', () => {
  assert.deepEqual(niceTicks(0), [0])
  assert.deepEqual(niceTicks(-5), [0])
})
