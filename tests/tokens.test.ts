/**
 * Mọi biến CSS được dùng đều phải tồn tại.
 *
 * Bài kiểm này sinh ra từ một buổi làm việc: đổi tên token `--income`/`--expense`
 * thành `--up`/`--down` làm gãy năm chỗ cùng lúc, và KHÔNG chỗ nào báo lỗi. CSS
 * không có `var()` thì lặng lẽ đổ về giá trị mặc định — cột biểu đồ chi hoá đen
 * kịt, thanh xếp hạng hoá trong suốt. Trình biên dịch không thấy, kiểm thử không
 * thấy, chỉ có mắt người nhìn lên máy thật mới thấy.
 *
 * Ba chỗ tệ nhất còn ghép tên biến bằng chuỗi — `var(--${kind})` — nên cả grep
 * cũng không tìm ra. Bài kiểm cấm luôn cách viết đó.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'

const SRC = 'src'
const TOKENS = 'src/styles/tokens.css'

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (['.ts', '.tsx', '.css'].includes(extname(full))) out.push(full)
  }
  return out
}

const files = walk(SRC)

/** Tên biến được ĐỊNH NGHĨA — chỉ lấy ở tokens.css, nơi duy nhất được phép */
function defined(): Set<string> {
  const css = readFileSync(TOKENS, 'utf8')
  const names = new Set<string>()
  for (const m of css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)) names.add(m[1])
  return names
}

test('mọi biến CSS được dùng đều đã được định nghĩa', () => {
  const have = defined()
  assert.ok(have.size > 40, `tokens.css phải định nghĩa đủ biến, đang có ${have.size}`)

  const missing: string[] = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(/var\((--[a-z0-9-]+)/g)) {
      if (!have.has(m[1])) missing.push(`${file}: ${m[1]}`)
    }
  }

  assert.deepEqual(missing, [], 'biến dùng nhưng chưa định nghĩa — CSS sẽ im lặng đổ về mặc định')
})

test('không được ghép tên biến CSS bằng chuỗi', () => {
  const offenders: string[] = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    // var(--${...}) hoặc var(-- + biến
    if (/var\(--\$\{/.test(text) || /var\(--'\s*\+/.test(text)) offenders.push(file)
  }
  assert.deepEqual(
    offenders,
    [],
    'ghép tên biến bằng chuỗi thì đổi tên token là gãy âm thầm — dùng hàm có kiểu, ví dụ flowColor()',
  )
})

test('chỉ tokens.css được định nghĩa biến gốc', () => {
  const elsewhere: string[] = []
  for (const file of files) {
    if (file.replace(/\\/g, '/') === TOKENS) continue
    if (extname(file) !== '.css') continue
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)) elsewhere.push(`${file}: ${m[1]}`)
  }
  assert.deepEqual(elsewhere, [], 'định nghĩa biến ngoài tokens.css thì hệ thống mất một nguồn sự thật duy nhất')
})
