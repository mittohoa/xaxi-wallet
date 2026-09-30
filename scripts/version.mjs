/**
 * Số hiệu bản dựng, sinh từ git.
 *
 * VÌ SAO CẦN: trước đây `versionCode 1` và `versionName "1.0"` viết cứng, nên
 * MỌI bản dựng đều là "1.0". Chân màn hình Cài đặt luôn ghi đúng một dòng đó.
 * Trong một buổi chiều đã có hơn chục bản cài chồng lên nhau; nếu mai có lỗi thì
 * không ai nói được máy đang chạy bản nào, và bản vừa sửa với bản hỏng nhìn
 * giống hệt nhau.
 *
 * Đây cũng là thứ duy nhất trong loại này mà để lâu là không cứu được: bản đã
 * phát ra không gắn nhãn lại được nữa.
 *
 * `versionCode` phải là số nguyên TĂNG DẦN — Android từ chối bản cập nhật có số
 * nhỏ hơn hoặc bằng bản đang cài. Số commit thoả điều đó một cách tự nhiên và
 * không cần ai nhớ tăng tay.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

function git(args, mac) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim()
  } catch {
    // Tải mã về dạng tệp nén thì không có git — vẫn phải dựng được
    return mac
  }
}

/** Phần nền do người viết đặt, ví dụ 1.0 */
function baseVersion() {
  try {
    return JSON.parse(readFileSync('package.json', 'utf8')).version ?? '1.0'
  } catch {
    return '1.0'
  }
}

export function buildVersion() {
  const count = Number(git(['rev-list', '--count', 'HEAD'], '0'))
  const sha = git(['rev-parse', '--short=7', 'HEAD'], 'khongro')
  const ban = git(['status', '--porcelain'], '') !== ''

  const base = baseVersion()
  return {
    /** Android đòi số nguyên tăng dần */
    code: Number.isFinite(count) && count > 0 ? count : 1,
    /** Hiện cho người dùng: 1.0.0+46 — dấu sao nghĩa là cây làm việc còn thay đổi chưa commit */
    name: `${base}+${count}${ban ? '*' : ''}`,
    sha,
    /** Chuỗi đầy đủ ở chân màn hình Cài đặt: 1.0.0+46 · a1aabc3 */
    full: `${base}+${count}${ban ? '*' : ''} · ${sha}`,
  }
}

// Chạy thẳng bằng node thì in ra. So đuôi tệp chứ không so URL: trên Windows
// đường dẫn có ổ đĩa và dấu gạch ngược nên hai chuỗi không bao giờ khớp.
if ((process.argv[1] ?? '').endsWith('version.mjs')) {
  console.log(JSON.stringify(buildVersion(), null, 2))
}
