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
    /*
     * Biến cục bộ tính là đã định nghĩa, nhưng CHỈ trong chính tệp khai báo nó.
     * Cho phép rộng hơn thì `var(--go-nham)` lại lọt lưới — mà đó đúng là thứ
     * bài kiểm này sinh ra để chặn: CSS im lặng đổ về mặc định, không báo gì.
     */
    const cucBo = new Set([...text.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
    for (const m of text.matchAll(/var\((--[a-z0-9-]+)/g)) {
      if (!have.has(m[1]) && !cucBo.has(m[1])) missing.push(`${file}: ${m[1]}`)
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

/**
 * Luật là TOKEN THIẾT KẾ phải có một nguồn duy nhất — không phải cấm mọi biến.
 *
 * Bản đầu cấm mọi dòng `--x:` nằm ngoài tokens.css. Nhưng biến cục bộ của một
 * bộ phận — như `--nut` trong thẻ số dư, để nút cài đặt và chỗ khuyết luôn khớp
 * nhau khi đổi một con số — là cách viết CSS bình thường và tốt. Nó không phải
 * token: không ai ngoài bộ phận đó dùng tới.
 *
 * Thứ thật sự nguy hiểm là định nghĩa ĐÈ LÊN GỐC ở nơi khác. Lúc đó cùng một
 * tên token mang hai giá trị tuỳ tệp nào nạp sau, và đó mới là mất nguồn sự
 * thật duy nhất.
 */
test('không tệp nào ngoài tokens.css được định nghĩa biến ở gốc', () => {
  const loi: string[] = []
  for (const file of files) {
    if (file.replace(/\\/g, '/') === TOKENS) continue
    if (extname(file) !== '.css') continue

    const text = readFileSync(file, 'utf8')
    // Tách theo khối: phần trước `{` là bộ chọn, phần sau là thân
    for (const khoi of text.split('}')) {
      const at = khoi.lastIndexOf('{')
      if (at < 0) continue
      const boChon = khoi.slice(0, at)
      const than = khoi.slice(at + 1)
      if (!/(^|[\s,])(:root|html|body)([\s,:]|$)/.test(boChon)) continue
      for (const m of than.matchAll(/(--[a-z0-9-]+)\s*:/g)) loi.push(`${file}: ${m[1]}`)
    }
  }
  assert.deepEqual(loi, [], 'định nghĩa token ở gốc ngoài tokens.css thì hệ thống mất một nguồn sự thật duy nhất')
})

/* ================= bộ màu danh mục ================= */

/**
 * Màu danh mục phải đến từ bộ đã đo, không phải từ chỗ khác.
 *
 * Bài kiểm này sinh ra từ một lỗ hổng thật: bộ tám sắc được sinh bằng công
 * thức, đo bằng bộ kiểm palette, ghi vào tài liệu thiết kế — rồi KHÔNG được
 * dùng ở đâu cả. Màu thật trong app vẫn là bộ cũ chưa qua kiểm định, và bộ cũ
 * thì trượt: một màu đọc ra xám, hai màu khác mắt thường cũng khó phân biệt.
 *
 * Tài liệu nói một đằng, mã làm một nẻo, mà không gì báo.
 */
test('màu danh mục mặc định đều lấy từ bộ đã đo', async () => {
  const { CATEGORY_COLORS, SYSTEM_COLOR } = await import('../src/lib/palette')
  const db = readFileSync('src/db/db.ts', 'utf8')

  // Mọi màu viết thẳng bằng mã hex trong bộ hạt giống đều là vi phạm
  const hardcoded = [...db.matchAll(/color: ('#[0-9a-f]{6}')/g)].map((m) => m[1])
  assert.deepEqual(hardcoded, [], 'màu danh mục phải trỏ tới palette.ts, không viết thẳng mã hex')

  assert.equal(CATEGORY_COLORS.length, 8)
  assert.equal(new Set(CATEGORY_COLORS).size, 8, 'không được trùng nhau')
  assert.match(SYSTEM_COLOR, /^#[0-9a-f]{6}$/)
})

test('bộ màu danh mục không dùng lại màu của thương hiệu hay trạng thái', async () => {
  const { CATEGORY_COLORS } = await import('../src/lib/palette')
  // Chanh và đỏ của logo mang nghĩa riêng: nhấn, và cảnh báo. Một danh mục
  // mang đúng màu đó thì hai nghĩa chồng lên nhau.
  const danhRieng = ['#b8ff3d', '#e34948', '#0d1117']
  for (const c of CATEGORY_COLORS) {
    assert.equal(danhRieng.includes(c.toLowerCase()), false, `${c} trùng màu dành riêng`)
  }
})
