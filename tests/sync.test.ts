/**
 * Kiểm hai nửa của đồng bộ: mã hoá và hợp nhất.
 *
 * Cả hai đều hỏng trong im lặng nếu sai. Mã hoá sai thì tệp vẫn tạo ra được,
 * vẫn trông như một khối byte vô nghĩa, và chỉ lộ khi có người thật sự cần mở
 * lại. Hợp nhất sai thì số liệu tài chính lệch đi mà không có gì báo — không
 * màn hình nào đỏ lên, chỉ là tổng chi tháng đó bỗng khác.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { SyncCryptoError, decryptSync, encryptSync } from '../src/lib/sync/crypto'
import { hasChanges, mergeData } from '../src/lib/sync/merge'
import type { BackupFile } from '../src/types'

type Data = BackupFile['data']

/* ================= mã hoá ================= */

test('mã hoá rồi giải mã ra đúng nội dung ban đầu', async () => {
  const goc = { xin: 'chào', so: 123456, mang: [1, 2, 3], long: { sau: true } }
  const e = await encryptSync(goc, 'cụm mật khẩu của tôi')
  assert.deepEqual(await decryptSync(e, 'cụm mật khẩu của tôi'), goc)
})

test('sai cụm mật khẩu thì không mở được, và không nói vì sao sai', async () => {
  const e = await encryptSync({ a: 1 }, 'đúng')
  await assert.rejects(
    () => decryptSync(e, 'sai'),
    (err: Error) => {
      assert.ok(err instanceof SyncCryptoError)
      // Không được phân biệt "sai mật khẩu" với "tệp hỏng": nói rõ là giúp người đoán mò
      assert.ok(/sai cụm mật khẩu, hoặc tệp đã hỏng/.test(err.message))
      return true
    },
  )
})

/**
 * Nội dung không được lọt ra ngoài phần mã hoá. Bài kiểm này bắt đúng lỗi kiểu
 * "quên mã hoá một trường" — thứ mà mắt nhìn phong bì không thấy.
 */
test('không một mẩu nội dung nào đọc được trong phong bì', async () => {
  const e = await encryptSync({ note: 'cà phê Highlands', amount: 35000 }, 'mk')
  const toanBo = JSON.stringify(e)
  assert.equal(toanBo.includes('Highlands'), false)
  assert.equal(toanBo.includes('35000'), false)
  assert.equal(toanBo.includes('note'), false)
})

test('hai lần mã hoá cùng một nội dung ra hai tệp khác nhau', async () => {
  const a = await encryptSync({ x: 1 }, 'mk')
  const b = await encryptSync({ x: 1 }, 'mk')
  assert.notEqual(a.data, b.data, 'muối và IV ngẫu nhiên mỗi lần')
  assert.notEqual(a.salt, b.salt)
  assert.notEqual(a.iv, b.iv)
})

test('sửa một byte trong dữ liệu là mở không được', async () => {
  const e = await encryptSync({ x: 1 }, 'mk')
  const hong = { ...e, data: `${e.data.slice(0, -4)}AAAA` }
  await assert.rejects(() => decryptSync(hong, 'mk'), SyncCryptoError)
})

test('từ chối tệp lạ và tệp thuộc bản mới hơn', async () => {
  await assert.rejects(() => decryptSync({ app: 'khac' }, 'mk'), /không phải tệp đồng bộ/)
  await assert.rejects(() => decryptSync({ app: 'xaxi-sync', v: 99 }, 'mk'), /cập nhật app/)
})

test('dữ liệu lớn không làm tràn ngăn xếp', async () => {
  // Đủ lớn để cách nối chuỗi ngây thơ vỡ; cũng là cỡ của một người dùng thật
  const rows = Array.from({ length: 5000 }, (_, i) => ({ id: `id-${i}`, note: `khoản ${i}`, amount: i * 1000 }))
  const e = await encryptSync({ rows }, 'mk')
  const lai = (await decryptSync(e, 'mk')) as { rows: typeof rows }
  assert.equal(lai.rows.length, 5000)
  assert.deepEqual(lai.rows[4999], rows[4999])
})

/* ================= hợp nhất ================= */

const rong = (): Data => ({
  categories: [],
  wallets: [],
  transactions: [],
  budgets: [],
  dayMarks: [],
  templates: [],
  recurring: [],
  settings: [],
  goals: [],
})

const cat = (id: string, name: string, updatedAt: number, deviceId = 'A', extra = {}) =>
  ({ id, name, kind: 'expense', icon: '🍜', color: '#000', updatedAt, deviceId, ...extra }) as never

const tx = (id: string, categoryId: string, walletId: string, updatedAt: number, extra = {}) =>
  ({
    id,
    date: '2026-09-30',
    kind: 'expense',
    amount: 35000,
    categoryId,
    walletId,
    updatedAt,
    deviceId: 'A',
    ...extra,
  }) as never

test('bản ghi chỉ có ở máy kia thì được thêm vào', () => {
  const mine = { ...rong(), transactions: [tx('t1', 'c1', 'w1', 100)] }
  const theirs = { ...rong(), transactions: [tx('t2', 'c1', 'w1', 200)] }
  const { data, report } = mergeData(mine, theirs)
  assert.equal(data.transactions.length, 2)
  assert.equal(report.added, 1)
})

test('cùng một id thì bản mới hơn thắng', () => {
  const mine = { ...rong(), transactions: [tx('t1', 'c1', 'w1', 100, { note: 'cũ' })] }
  const theirs = { ...rong(), transactions: [tx('t1', 'c1', 'w1', 200, { note: 'mới' })] }
  const { data, report } = mergeData(mine, theirs)
  assert.equal(data.transactions.length, 1)
  assert.equal((data.transactions[0] as { note: string }).note, 'mới')
  assert.equal(report.updated, 1)
})

test('bản cũ hơn ở máy kia không ghi đè bản mới ở máy này', () => {
  const mine = { ...rong(), transactions: [tx('t1', 'c1', 'w1', 300, { note: 'mới' })] }
  const theirs = { ...rong(), transactions: [tx('t1', 'c1', 'w1', 100, { note: 'cũ' })] }
  const { data } = mergeData(mine, theirs)
  assert.equal((data.transactions[0] as { note: string }).note, 'mới')
})

/**
 * Hoà `updatedAt` phải phá thế hoà bằng thứ tất định, không phải theo thứ tự
 * mảng. Nếu mỗi máy chọn một bản khác nhau thì chúng KHÔNG BAO GIỜ hội tụ — lần
 * đồng bộ nào cũng thấy có thay đổi, mãi mãi.
 */
test('hoà thì hai máy vẫn ra cùng một kết quả', () => {
  const a = cat('c1', 'Ăn uống', 100, 'may-A')
  const b = cat('c1', 'Ăn uống', 100, 'may-B')

  const x = mergeData({ ...rong(), categories: [a] }, { ...rong(), categories: [b] })
  const y = mergeData({ ...rong(), categories: [b] }, { ...rong(), categories: [a] })
  assert.deepEqual(x.data.categories[0], y.data.categories[0])
})

/**
 * Bài kiểm quan trọng nhất của tệp này.
 *
 * Mỗi máy lúc mới cài đều tự gieo bộ danh mục mặc định, nên cả hai đều có "Ăn
 * uống" với hai UUID khác nhau, và giao dịch ở mỗi máy trỏ vào id của riêng
 * mình. Ghép thẳng thì người dùng có hai danh mục cùng tên, mỗi cái giữ một nửa
 * số liệu — và không có gì báo.
 */
test('hai danh mục cùng tên do hai máy tự gieo được gộp làm một', () => {
  const mine = {
    ...rong(),
    categories: [cat('c-A', 'Ăn uống', 100, 'may-A')],
    transactions: [tx('t1', 'c-A', 'w-A', 100)],
  }
  const theirs = {
    ...rong(),
    categories: [cat('c-B', 'Ăn uống', 200, 'may-B')],
    transactions: [tx('t2', 'c-B', 'w-B', 200)],
  }

  const { data, report } = mergeData(mine, theirs, 999)

  const song = data.categories.filter((c) => !c.deletedAt)
  assert.equal(song.length, 1, 'chỉ còn một "Ăn uống"')
  assert.equal(song[0].id, 'c-B', 'bản mới hơn thắng')

  const thua = data.categories.find((c) => c.id === 'c-A')
  assert.ok(thua?.deletedAt, 'bản thua bị đánh bia mộ, không phải bỏ đi — máy kia cũng phải biết')

  // Và quan trọng nhất: giao dịch cũ phải trỏ sang danh mục còn sống
  assert.deepEqual(
    data.transactions.map((t) => t.categoryId).sort(),
    ['c-B', 'c-B'],
    'khoá ngoại phải được nối lại, nếu không nửa số liệu mồ côi',
  )
  assert.ok(report.collapsed >= 1 && report.relinked >= 1)
})

test('danh mục trùng tên nhưng khác loại thì KHÔNG gộp', () => {
  const mine = { ...rong(), categories: [cat('c1', 'Thưởng', 100)] }
  const theirs = { ...rong(), categories: [{ ...(cat('c2', 'Thưởng', 200) as object), kind: 'income' } as never] }
  const { data } = mergeData(mine, theirs)
  assert.equal(data.categories.filter((c) => !c.deletedAt).length, 2)
})

/**
 * §3.6 gọi tên đúng chỗ này: hai máy cùng đối soát một ví thì mỗi máy sinh một
 * bút toán bù chênh lệch. Giữ cả hai là bù HAI LẦN — số dư ví sai đúng bằng một
 * lần chênh lệch, và người dùng không có cách nào nhận ra.
 */
test('hai bút toán đối soát cùng ví cùng ngày chỉ giữ một', () => {
  const mine = { ...rong(), transactions: [tx('r1', 'c1', 'w1', 100, { source: 'reconcile', amount: 240000 })] }
  const theirs = { ...rong(), transactions: [tx('r2', 'c1', 'w1', 200, { source: 'reconcile', amount: 240000 })] }

  const { data } = mergeData(mine, theirs, 999)
  assert.equal(data.transactions.filter((t) => !t.deletedAt).length, 1, 'không được bù hai lần')
})

test('hai lần mua cà phê giống hệt nhau vẫn là hai khoản', () => {
  const mine = { ...rong(), transactions: [tx('t1', 'c1', 'w1', 100)] }
  const theirs = { ...rong(), transactions: [tx('t2', 'c1', 'w1', 100)] }
  const { data } = mergeData(mine, theirs)
  assert.equal(data.transactions.filter((t) => !t.deletedAt).length, 2, 'giao dịch thường không có khoá tự nhiên')
})

test('hai máy cùng đánh dấu một ngày không chi tiêu thì gộp làm một', () => {
  const mark = (id: string, date: string, updatedAt: number) =>
    ({ id, date, markedAt: 0, updatedAt, deviceId: 'A' }) as never
  const mine = { ...rong(), dayMarks: [mark('d1', '2026-09-30', 100)] }
  const theirs = { ...rong(), dayMarks: [mark('d2', '2026-09-30', 200)] }

  const { data } = mergeData(mine, theirs, 999)
  assert.equal(data.dayMarks.filter((d) => !d.deletedAt).length, 1, 'cột date là chỉ mục duy nhất — hai bản là vỡ')
})

test('cài đặt gộp về đúng một dòng', () => {
  const st = (id: string, theme: string, updatedAt: number) =>
    ({ id, theme, locale: 'vi', currency: 'VND', updatedAt, deviceId: 'A' }) as never
  const { data } = mergeData(
    { ...rong(), settings: [st('s1', 'dark', 100)] },
    { ...rong(), settings: [st('s2', 'light', 200)] },
    999,
  )
  const song = data.settings.filter((s) => !s.deletedAt)
  assert.equal(song.length, 1, 'hai dòng cài đặt thì app đọc phải dòng nào là tuỳ may rủi')
  assert.equal((song[0] as { theme: string }).theme, 'light')
})

/**
 * Bia mộ phải THẮNG bản còn sống cũ hơn. Đây chính là lý do bia mộ tồn tại: máy
 * kia vẫn giữ bản cũ và sẽ gửi về, nếu bia mộ thua thì khoản đã xoá mọc lại.
 */
test('bản đã xoá không mọc lại từ máy chưa biết tin', () => {
  const mine = { ...rong(), transactions: [tx('t1', 'c1', 'w1', 500, { deletedAt: 500 })] }
  const theirs = { ...rong(), transactions: [tx('t1', 'c1', 'w1', 100)] }
  const { data } = mergeData(mine, theirs)
  assert.ok(data.transactions[0].deletedAt, 'bia mộ mới hơn nên phải thắng')
})

test('xoá ở máy kia thì cũng xoá ở máy này', () => {
  const mine = { ...rong(), transactions: [tx('t1', 'c1', 'w1', 100)] }
  const theirs = { ...rong(), transactions: [tx('t1', 'c1', 'w1', 500, { deletedAt: 500 })] }
  const { data } = mergeData(mine, theirs)
  assert.ok(data.transactions[0].deletedAt)
})

test('hợp nhất với chính mình thì không có gì thay đổi', () => {
  const mine = {
    ...rong(),
    categories: [cat('c1', 'Ăn uống', 100)],
    transactions: [tx('t1', 'c1', 'w1', 100)],
  }
  const { data, report } = mergeData(mine, mine)
  assert.equal(hasChanges(report), false, 'đồng bộ hai lần liên tiếp không được sinh thay đổi giả')
  assert.deepEqual(data.transactions, mine.transactions)
})

/** Hội tụ: hợp nhất lần hai phải không còn gì để làm, nếu không nó chạy mãi */
test('hợp nhất hai lần thì lần sau đứng yên', () => {
  const mine = { ...rong(), categories: [cat('c-A', 'Ăn uống', 100, 'may-A')] }
  const theirs = { ...rong(), categories: [cat('c-B', 'Ăn uống', 200, 'may-B')] }

  const lan1 = mergeData(mine, theirs, 999)
  const lan2 = mergeData(lan1.data, lan1.data, 1000)
  assert.equal(hasChanges(lan2.report), false)
  assert.deepEqual(lan2.data.categories, lan1.data.categories)
})

test('tệp sao lưu bản cũ không có goals thì đọc thành mảng rỗng', () => {
  const cu = { ...rong() }
  delete (cu as Partial<Data>).goals
  const { data } = mergeData(cu, { ...rong(), goals: [] })
  assert.deepEqual(data.goals, [])
})

/**
 * Bản ghi gieo sẵn phải THUA bản thật, dù nó mới hơn về thời gian.
 *
 * Hỏng đúng ở lần dùng thật đầu tiên: cài app lên máy mới, nó gieo "Tiền mặt"
 * số dư 0 vào lúc T2; nhập tệp từ máy cũ có "Tiền mặt" thật sửa lần cuối T1 <
 * T2. Hai ví cùng tên bị gộp, cái TRẮNG thắng vì mới hơn, và số dư đầu kỳ biến
 * mất không một lời báo.
 *
 * Đã đo trên máy thật trước khi sửa: nhập tệp chứa ba giao dịch 146.000 đ mà số
 * dư tụt 2.146.000 đ.
 */
test('ví gieo sẵn trên máy mới không được ghi đè ví thật của máy cũ', () => {
  const viGieo = { id: 'w-moi', name: 'Tiền mặt', kind: 'cash', openingBalance: 0, updatedAt: 0, deviceId: 'may-moi' } as never
  const viThat = { id: 'w-cu', name: 'Tiền mặt', kind: 'cash', openingBalance: 2_000_000, updatedAt: 100, deviceId: 'may-cu' } as never

  const { data } = mergeData({ ...rong(), wallets: [viGieo] }, { ...rong(), wallets: [viThat] }, 999)

  const song = data.wallets.filter((w) => !w.deletedAt)
  assert.equal(song.length, 1)
  assert.equal((song[0] as { openingBalance: number }).openingBalance, 2_000_000, 'số dư đầu kỳ thật phải sống sót')
  assert.equal(song[0].id, 'w-cu')
})

test('hai máy đều mới gieo thì vẫn ra cùng một kết quả', () => {
  const a = { id: 'w-A', name: 'Tiền mặt', kind: 'cash', openingBalance: 0, updatedAt: 0, deviceId: 'may-A' } as never
  const b = { id: 'w-B', name: 'Tiền mặt', kind: 'cash', openingBalance: 0, updatedAt: 0, deviceId: 'may-B' } as never

  const x = mergeData({ ...rong(), wallets: [a] }, { ...rong(), wallets: [b] }, 999)
  const y = mergeData({ ...rong(), wallets: [b] }, { ...rong(), wallets: [a] }, 999)
  assert.equal(
    x.data.wallets.filter((w) => !w.deletedAt)[0].id,
    y.data.wallets.filter((w) => !w.deletedAt)[0].id,
    'hoà thì phá thế hoà bằng deviceId, không phải theo thứ tự tham số',
  )
})
