/**
 * Dựng bản desktop, tự tìm bộ công cụ Rust.
 *
 *   npm run desktop:build     # đóng gói đầy đủ
 *   npm run desktop:dev       # chạy thử
 *   npm run desktop:build -- --no-bundle   # chỉ biên dịch, không đóng gói
 *
 * VÌ SAO CẦN: `tauri build` gọi `cargo`, mà rustup cài cargo vào
 * `~/.cargo/bin` và chỉ thêm đường dẫn đó vào PATH của shell đăng nhập. Trên
 * chính máy phát triển này, PATH của PowerShell và của bash đều KHÔNG có nó, nên
 * `npm run desktop:build` đổ ngay từ dòng đầu với "cargo not found" — dù bộ công
 * cụ đã cài đầy đủ.
 *
 * Cùng một vấn đề với `adb` đã gặp ở scripts/install-apk.mjs, và cùng một cách
 * giải: đừng tin PATH, đi tìm.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const isWindows = process.platform === 'win32'
const exe = (n) => (isWindows ? `${n}.exe` : n)

/**
 * Nơi cargo thường nằm, theo thứ tự hay gặp.
 *
 * Dùng dấu gạch xuôi kể cả trên Windows: Node hiểu cả hai, còn dấu gạch ngược
 * trong chuỗi JavaScript là ký tự thoát, rất dễ viết sai mà không báo lỗi.
 */
function timCargo() {
  const trongPath = spawnSync(exe('cargo'), ['--version'], { encoding: 'utf8' })
  if (trongPath.status === 0) return exe('cargo')

  const nha = homedir().replace(/\\/g, '/')
  const ungVien = [
    `${nha}/.cargo/bin/${exe('cargo')}`,
    'C:/Program Files/Rust/bin/cargo.exe',
    '/usr/local/cargo/bin/cargo',
  ]
  return ungVien.find((p) => existsSync(p)) ?? null
}

const cargo = timCargo()
if (!cargo) {
  console.error('Không tìm thấy cargo. Cài bộ công cụ Rust ở https://rustup.rs rồi chạy lại.')
  process.exit(1)
}

const ver = spawnSync(cargo, ['--version'], { encoding: 'utf8' })
console.log(`Dùng ${(ver.stdout ?? '').trim()}`)

// Thêm thư mục chứa cargo vào PATH cho tiến trình con: tauri cli gọi `cargo`
// theo tên, không theo đường dẫn
const thuMuc = cargo.includes('/') ? cargo.slice(0, cargo.lastIndexOf('/')) : null
const env = thuMuc ? { ...process.env, PATH: `${thuMuc}${isWindows ? ';' : ':'}${process.env.PATH}` } : process.env

const lenh = process.argv[2] === 'dev' ? 'dev' : 'build'
const them = process.argv.slice(3)

const r = spawnSync('npx', ['tauri', lenh, ...them], { stdio: 'inherit', env, shell: true })
process.exit(r.status ?? 1)
