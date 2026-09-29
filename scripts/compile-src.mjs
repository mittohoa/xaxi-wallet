/**
 * Nạp một mô-đun của app vào công cụ chạy tại máy.
 *
 * VÌ SAO KHÔNG VIẾT LẠI: các công cụ ở đây đọc cùng thứ dữ liệu mà app đọc —
 * biên lai, tin nhắn ghi chi. Viết một bộ đọc riêng cho công cụ là có hai bộ
 * luật phải giữ khớp bằng tay, và người dùng sẽ gặp cảnh công cụ đọc ra một số
 * còn app dán tay ra số khác. Biên dịch thẳng từ nguồn thì hai bên luôn là một,
 * kể cả khi bộ đọc được sửa sau này.
 */
import { build } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * @param {string} entry đường dẫn tới tệp nguồn, ví dụ 'src/lib/quickadd.ts'
 * @returns {Promise<Record<string, unknown>>} mô-đun đã nạp
 */
export async function loadFromSource(entry) {
  const dir = mkdtempSync(join(tmpdir(), 'xaxi-src-'))
  const out = join(dir, 'mod.mjs')
  await build({
    entryPoints: [entry],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'error',
  })
  // Windows trả về đường dẫn có dấu gạch ngược; import() đòi URL file://
  return import(`file://${out.replace(/\\/g, '/')}`)
}
