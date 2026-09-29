/**
 * Cài bản APK vừa dựng lên máy đang cắm.
 *
 * Tồn tại vì `npm run android:install` trước đây gọi thẳng `adb`, và `adb` chỉ
 * nằm trong PATH nếu người dùng tự thêm vào — trên chính máy phát triển này thì
 * không. Build chạy xong, Gradle báo thành công, rồi lệnh cuối cùng đổ vì không
 * tìm thấy `adb`: mất cả phút build để nhận một lỗi không liên quan gì tới mã.
 *
 * `android-tools.mjs` vốn đã biết tự dò SDK, nên chỉ cần dùng lại nó.
 */
import { existsSync } from 'node:fs'
import { adb, connectedDevice } from './android-tools.mjs'

/*
 * Máy thật đang chạy bản release. Cài bản debug đè lên bị Android từ chối vì
 * khác chữ ký, và cách duy nhất để ép là gỡ app ra — tức là xoá sạch dữ liệu
 * tài chính thật của người dùng. Nên mặc định lấy bản release nếu nó có.
 */
const RELEASE = 'android/app/build/outputs/apk/release/app-release.apk'
const DEBUG = 'android/app/build/outputs/apk/debug/app-debug.apk'
const APK = process.argv.includes('--debug') ? DEBUG : existsSync(RELEASE) ? RELEASE : DEBUG

if (!existsSync(APK)) {
  console.error(`Chưa có ${APK}. Chạy "npm run android:apk" hoặc "npm run android:release" trước.`)
  process.exit(1)
}

const device = connectedDevice()
if (!device) {
  console.error('Không thấy máy Android nào đang cắm. Bật gỡ lỗi USB rồi cắm lại.')
  process.exit(1)
}

console.log(`Cài lên ${device}…`)
// adb trả về chuỗi, và nó báo lỗi cài đặt bằng chữ "Failure" trong stdout chứ
// không bằng mã thoát — kiểm mã thoát thôi thì mọi lần cài hỏng đều báo thành công
const out = adb(['install', '-r', APK], { quiet: false })
console.log(out)
if (!/Success/.test(out)) {
  console.error('Cài không thành công.')
  process.exit(1)
}
