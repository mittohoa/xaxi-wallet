/**
 * Bày toàn bộ biểu tượng ra một trang, để nhìn hết cùng lúc.
 *
 *   npm run icons:sheet          # mở trên máy Android đang cắm
 *   npm run icons:sheet -- --web # chỉ ghi ra tệp HTML rồi tự mở bằng gì cũng được
 *
 * VÌ SAO CẦN: bài kiểm trong `tests/icons.test.ts` canh được ranh giới emoji,
 * canh được màu viết cứng, canh được hình không ai dùng — nhưng không canh được
 * một đường `d` sai. Một hình vẽ ra méo vẫn qua hết mọi bài kiểm, vì nó vẫn là
 * SVG hợp lệ và vẫn dùng đúng `currentColor`. Chỉ có mắt người mới thấy.
 *
 * Trang này đã trả công ngay lần đầu dùng: bánh răng vốn là tám mũi nhọn quanh
 * một vòng tròn, ở cỡ 20px trong app trông vẫn ổn, nhưng phóng lên thì ra hình
 * mặt trời. Trong app sẽ không bao giờ có ai phát hiện ra.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { adb, connectedDevice } from './android-tools.mjs'

const PORT = 8099
const OUT = 'icon-sheet.html'
const webOnly = process.argv.includes('--web')

const src = readFileSync('src/components/Icon.tsx', 'utf8')
const block = src.slice(src.indexOf('const PATHS = {'), src.indexOf('} as const'))

/**
 * Đếm dấu ngoặc thay vì dùng một biểu thức chính quy.
 *
 * Bản đầu dùng regex và im lặng bỏ sót đúng ba hình — hình nào đứng ngay sau
 * một dòng chú thích đều bị nuốt vào hình liền trước, vì dòng trống ở giữa làm
 * phần nhìn-trước hỏng. Bảng vẫn hiện ra đẹp đẽ và không báo gì cả. Với một
 * công cụ mà cả mục đích là để kiểm bằng mắt thì bỏ sót trong im lặng là lỗi
 * nặng nhất nó có thể mắc.
 */
function parseIcons() {
  const out = []
  const lines = block.split('\n')
  const count = (s, re) => (s.match(re) ?? []).length

  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(/^ {2}([a-z]+): (.*)$/)
    if (!head) continue

    let body = head[2]
    let depth = count(body, /\(/g) - count(body, /\)/g)
    while (depth > 0 && i + 1 < lines.length) {
      const next = lines[++i]
      body += `\n${next}`
      depth += count(next, /\(/g) - count(next, /\)/g)
    }

    out.push([
      head[1],
      body
        .replace(/^\(/, '')
        .replace(/\),?$/, '')
        .replace(/,$/, '')
        .replace(/<\/?>/g, '')
        // Bỏ chú thích JSX, chúng không phải là hình
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .trim(),
    ])
  }
  return out
}

const icons = parseIcons()

const cell = ([name, body]) => `
  <figure>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
         stroke-linecap="round" stroke-linejoin="round">${body}</svg>
    <figcaption>${name}</figcaption>
  </figure>`

const grid = () => `<div class="grid">${icons.map(cell).join('')}</div>`

const html = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Biểu tượng XAXI (${icons.length})</title>
<style>
  body { margin:0; font:15px/1.4 system-ui, sans-serif; background:#0d1117; color:#e8eaed }
  h2 { margin:20px 16px 8px; font-size:13px; letter-spacing:.08em; text-transform:uppercase; opacity:.6 }
  .grid { display:grid; grid-template-columns:repeat(4,1fr); gap:4px; padding:0 12px }
  figure { margin:0; padding:14px 4px; text-align:center; background:#161b22; border-radius:12px }
  svg { width:34px; height:34px }
  figcaption { margin-top:8px; font-size:11px; opacity:.55 }
  .sang { background:#f4f5f0; color:#0d1117 }
  .sang figure { background:#fff }
  .to svg { width:72px; height:72px }
  .to .grid { grid-template-columns:repeat(3,1fr) }
</style>
<h2>Nền tối · ${icons.length} hình</h2>
${grid()}
<div class="sang"><h2>Nền sáng</h2>${grid()}</div>
<div class="to"><h2>Cỡ lớn — soi nét</h2>${grid()}</div>`

writeFileSync(OUT, html)
console.log(`${icons.length} hình → ${OUT}`)
console.log(icons.map((i) => i[0]).join(', '))

if (webOnly) process.exit(0)

const device = connectedDevice()
if (!device) {
  console.log(`\nKhông thấy máy Android nào. Mở thẳng ${OUT} bằng trình duyệt trên máy này.`)
  process.exit(0)
}

const server = createServer((_, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(html)
})

server.listen(PORT, '127.0.0.1', () => {
  // `reverse` để máy Android gọi ngược về đây; không mở cổng ra mạng ngoài
  adb(['reverse', `tcp:${PORT}`, `tcp:${PORT}`])
  adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `http://localhost:${PORT}`])
  console.log(`\nĐã mở trên ${device}. Ctrl+C để dừng.`)
})

process.on('SIGINT', () => {
  adb(['reverse', '--remove', `tcp:${PORT}`])
  server.close()
  process.exit(0)
})
