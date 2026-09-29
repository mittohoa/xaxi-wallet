/**
 * Goi Gradle wrapper cua du an Android, chon dung trinh goi theo he dieu hanh.
 * Can thiet vi npm tren Windows co the chay script qua cmd.exe hoac qua Git Bash —
 * `gradlew.bat` chi tim thay o cai dau, `./gradlew` chi chay duoc o cai sau.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const dir = resolve('android')
if (!existsSync(dir)) {
  console.error('Chưa có thư mục android/. Chạy `npm run android:add` trước.')
  process.exit(1)
}

const isWindows = process.platform === 'win32'
const wrapper = resolve(dir, isWindows ? 'gradlew.bat' : 'gradlew')
if (!existsSync(wrapper)) {
  console.error(`Không tìm thấy Gradle wrapper tại ${wrapper}`)
  process.exit(1)
}

// Tu Node 18.20, spawn thang mot file .bat se bao EINVAL — bat buoc phai qua shell.
// Doi tuong goi la wrapper co dinh cua du an, khong phai chuoi tu nguoi dung nhap.
const args = process.argv.slice(2)
const result = spawnSync(wrapper, args, { cwd: dir, stdio: 'inherit', shell: isWindows })

if (result.error) {
  console.error('Không chạy được Gradle:', result.error.message)
  process.exit(1)
}
process.exit(result.status ?? 1)
