/**
 * Giữ ranh giới giữa biểu tượng vector và emoji.
 *
 * Bộ biểu tượng vector chỉ có ích nếu nó là bộ DUY NHẤT. Một emoji lọt lại vào
 * giao diện sẽ không đổi màu theo nền sáng/tối, không nhạt đi khi nút bị khoá,
 * và hình dạng thì do hệ điều hành chọn hộ. Ba bài kiểm dưới đây canh đúng chỗ
 * đó, vì bằng mắt thì không ai thấy — trên máy của người viết mã nó vẫn đẹp.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { ICON_NAMES } from '../src/components/Icon'

/* Windows tra ve dau gach cheo nguoc; viet thang ky tu do vao day rat de bi
   nuot mat mot lop thoat, nen dung ma ky tu cho chac */
const SEP = String.fromCharCode(92)

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p.split(SEP).join('/'))
  }
  return out
}

const FILES = walk('src')
const read = (f: string) => readFileSync(f, 'utf8')

/**
 * Chỉ bắt HÌNH VẼ, không bắt dấu câu.
 *
 * Mũi tên trong một câu như "ghi vào Chi chưa rõ" là dấu câu thật, cùng hạng với
 * dấu gạch ngang — nó nằm trong chuỗi chữ, đôi khi trong cả thông báo toast, nơi
 * không đặt được thẻ SVG. Cấm luôn cả nó thì bài kiểm đang ép người viết làm một
 * việc vô nghĩa.
 */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{23E9}-\u{23FA}]/u

/**
 * Ký tự đứng MỘT MÌNH trên một dòng là chuyện khác hẳn: đó không phải dấu câu
 * giữa câu văn, đó là toàn bộ nội dung của một cái nút. Chỗ đó phải là biểu
 * tượng vector — mũi tên và dấu nhân lấy từ phông hệ thống thì máy Android
 * thiếu phông sẽ vẽ ra ô vuông rỗng.
 */
const LONE_GLYPH = /^[\u{2190}-\u{21FF}\u{2713}\u{2717}\u{00D7}\u{FF0B}]+$/u

/**
 * Emoji được phép ở đâu, và vì sao.
 *
 * Biểu tượng của danh mục, hũ, mục tiêu và ví là DỮ LIỆU — người dùng tự chọn
 * và nó nằm trong IndexedDB. Những tệp dưới đây là nơi khai báo bộ dữ liệu đó.
 */
const DATA_FILES = new Set(['src/db/db.ts', 'src/lib/jars.ts', 'src/lib/stats.ts'])

/** Dòng đang gán một giá trị biểu tượng vào dữ liệu, chứ không phải vẽ giao diện */
function isDataLine(line: string): boolean {
  // `icon: '🍜'` khai báo dữ liệu, `cat?.icon ?? '❓'` đọc lại chính dữ liệu đó
  return /\bicon\b\s*[:=]/.test(line) || /\.icon\b/.test(line) || /setIcon\(|useState\(/.test(line)
}

test('không còn emoji nào nằm trong phần giao diện', () => {
  const loi: string[] = []

  for (const file of FILES) {
    if (!/\.tsx?$/.test(file)) continue
    if (DATA_FILES.has(file)) continue
    // Chính tệp bộ biểu tượng có emoji trong phần chú thích giải thích lý do
    if (file === 'src/components/Icon.tsx') continue

    read(file)
      .split('\n')
      .forEach((line, i) => {
        if (!EMOJI.test(line) && !LONE_GLYPH.test(line.trim())) return
        if (isDataLine(line)) return
        loi.push(`${file}:${i + 1}  ${line.trim().slice(0, 70)}`)
      })
  }

  assert.deepEqual(loi, [], `Dùng <Icon name="…" /> thay vì emoji:\n${loi.join('\n')}`)
})

/**
 * Biểu tượng không được tự đặt màu.
 *
 * Cả bộ vẽ bằng `currentColor`, nên nó đi theo màu của phần tử chứa nó: nút bị
 * khoá thì nhạt đi, dòng cảnh báo thì đỏ theo, đổi nền tối thì sáng lên. Một
 * hình lỡ viết cứng mã màu sẽ đứng im giữa tất cả những thứ đó, và chỉ lộ ra
 * khi có người mở nền tối.
 */
test('không hình nào viết cứng mã màu', () => {
  const src = read('src/components/Icon.tsx')
  const paths = src.slice(src.indexOf('const PATHS'), src.indexOf('} as const'))

  assert.equal(/fill="(?!none)/.test(paths), false, 'hình không được tự tô màu')
  assert.equal(/stroke="(?!currentColor)/.test(paths), false, 'hình không được tự đặt màu nét')
  assert.equal(/#[0-9a-f]{3,8}\b/i.test(paths), false, 'không được có mã màu trong hình')
})

/**
 * Biểu tượng vẽ ra mà không ai dùng là mã chết: nó vẫn phải sửa mỗi lần đổi
 * phong cách, vẫn nằm trong gói tải về, nhưng không ai từng nhìn thấy.
 */
test('mọi biểu tượng trong bộ đều có nơi dùng', () => {
  const dung = FILES.filter((f) => /\.tsx?$/.test(f) && f !== 'src/components/Icon.tsx')
    .map(read)
    .join('\n')

  // Chỉ đọc tên nằm TRONG thẻ <Icon>. Quét cả tệp thì 'cash' của loại ví cũng
  // tính là đã dùng, và bài kiểm mất hết tác dụng.
  const daDung = new Set<string>()
  for (const the of dung.match(/<Icon[^>]*?\/>/g) ?? []) {
    for (const m of the.matchAll(/['"]([a-z]+)['"]/g)) daDung.add(m[1])
  }
  // `<Empty icon="receipt" />` cũng là một nơi dùng, chỉ là đi qua một lớp bọc
  for (const m of dung.matchAll(/\bicon=["']([a-z]+)["']/g)) daDung.add(m[1])

  const thua = ICON_NAMES.filter((n) => !daDung.has(n))
  assert.deepEqual(thua, [], `Biểu tượng không ai dùng — xoá đi hoặc dùng nó:\n${thua.join(', ')}`)
})

test('tên biểu tượng không trùng nhau', () => {
  assert.equal(new Set(ICON_NAMES).size, ICON_NAMES.length)
})
