/**
 * Dựng và cài bản debug được ký bằng KHOÁ PHÁT HÀNH.
 *
 *   npm run android:debug-signed
 *
 * VÌ SAO CẦN: bộ rà `npm run device:check` lái app qua cổng gỡ lỗi WebView, mà
 * bản phát hành cố ý tắt cổng đó. Cài bản debug thường đè lên thì Android từ
 * chối vì khác chữ ký, còn gỡ app ra là xoá sạch dữ liệu tài chính thật của
 * người dùng. Ký cùng một khoá thì cài đè được, giữ nguyên dữ liệu, và bộ rà
 * chạy được trên chính máy thật.
 *
 * ĐÂY LÀ CÔNG CỤ CHO MÁY PHÁT TRIỂN, KHÔNG PHẢI ĐỂ PHÁT HÀNH.
 *
 * Bản sinh ra là một bản cập nhật HỢP LỆ của app thật: nó mở cổng gỡ lỗi và
 * không rút gọn mã. Đừng gửi nó cho ai. Rà xong thì cài lại bản phát hành:
 *
 *   npm run android:release && node scripts/install-apk.mjs
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

if (!existsSync('android/keystore.properties')) {
  console.error('Chưa có android/keystore.properties — không có khoá thì không ký được.')
  console.error('Xem mục Android trong README.')
  process.exit(1)
}

const env = { ...process.env, XAXI_DEBUG_RELEASE_SIGNED: '1' }

function chay(args, mo) {
  console.log(`\n── ${mo}`)
  const r = spawnSync('npm', args, { stdio: 'inherit', env, shell: true })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

chay(['run', 'android:apk'], 'dựng bản debug, ký bằng khoá phát hành')

console.log('\n── cài lên máy')
const r = spawnSync('node', ['scripts/install-apk.mjs', '--debug'], { stdio: 'inherit', env })
if (r.status !== 0) process.exit(r.status ?? 1)

console.log('\nXong. Giờ chạy: npm run device:check')
console.log('Rà xong nhớ cài lại bản phát hành — bản này mở cổng gỡ lỗi.')
