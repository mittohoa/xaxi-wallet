import assert from 'node:assert/strict'
import test from 'node:test'

import { findNumberWords } from '../src/lib/numberwords'
import { normalize } from '../src/lib/quickadd'

const read = (s: string) => findNumberWords(normalize(s))?.value ?? null

test('đọc được số tiền nói bằng lời', () => {
  assert.equal(read('ba mươi lăm nghìn'), 35_000)
  assert.equal(read('một trăm hai mươi nghìn'), 120_000)
  assert.equal(read('năm trăm nghìn'), 500_000)
  assert.equal(read('hai mươi ba nghìn'), 23_000)
  assert.equal(read('một trăm lẻ năm nghìn'), 105_000)
  assert.equal(read('mười lăm triệu'), 15_000_000)
  assert.equal(read('hai triệu rưỡi'), 2_500_000)
  assert.equal(read('ba nghìn rưỡi'), 3_500)
  assert.equal(read('một tỷ'), 1_000_000_000)
})

test('chấp nhận các cách đọc thay thế của người Việt', () => {
  assert.equal(read('hai mươi tư nghìn'), 24_000)
  assert.equal(read('hai mươi mốt nghìn'), 21_000)
  assert.equal(read('hai mươi nhăm nghìn'), 25_000)
  assert.equal(read('năm trăm ngàn'), 500_000)
})

test('lấy được cụm số nằm giữa câu nói', () => {
  const hit = findNumberWords(normalize('cà phê ba mươi lăm nghìn'))!
  assert.equal(hit.value, 35_000)
  const folded = normalize('cà phê ba mươi lăm nghìn')
  assert.equal(folded.slice(hit.start, hit.end), 'ba muoi lam nghin')
})

test('bỏ qua câu không có số', () => {
  assert.equal(read('cà phê sáng nay'), null)
  assert.equal(read(''), null)
})

test('một chữ số trơ trọi không được coi là số tiền nói miệng', () => {
  // 'ba' trong 'ba lo' la mot phan cua tu, khong phai so tien
  assert.equal(read('mua ba lô'), null)
})

test('vẫn đọc được khi người dùng trộn chữ số với chữ', () => {
  assert.equal(read('35 nghìn'), 35_000)
  assert.equal(read('2 triệu rưỡi'), 2_500_000)
})
