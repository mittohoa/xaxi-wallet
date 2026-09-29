/**
 * Goi Gradle wrapper cua du an Android, chon dung trinh goi theo he dieu hanh.
 * Can thiet vi npm tren Windows co the chay script qua cmd.exe hoac qua Git Bash —
 * `gradlew.bat` chi tim thay o cai dau, `./gradlew` chi chay duoc o cai sau.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

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

const JAVA_BIN = isWindows ? 'java.exe' : 'java'

/** Thu muc nay co phai mot JDK khong */
function isJdk(dir) {
  return existsSync(join(dir, 'bin', JAVA_BIN))
}

/**
 * Doc phien ban chinh tu chinh trinh java.
 *
 * Khong tin ten thu muc: tren may nay co mot thu muc `jbr` day du ca `bin/java.exe`
 * nhung thieu `lib/jvm.cfg` — chay len la bao loi. Hoi that thi loai duoc ngay.
 */
function majorVersion(dir) {
  const out = spawnSync(join(dir, 'bin', JAVA_BIN), ['-version'], { encoding: 'utf8' })
  const text = `${out.stdout ?? ''}${out.stderr ?? ''}`
  const m = text.match(/version "(\d+)/)
  return m ? Number(m[1]) : 0
}

/**
 * Tim mot JDK 17 tro len.
 *
 * Android Gradle Plugin doi Java 17; nhieu may Windows lai co JDK 11 dung truoc
 * trong PATH, va loi chi hien luc build chu khong luc cai dat. De build phu
 * thuoc vao bien moi truong san co nghia la no chay tren may nay va hong tren
 * may khac ma khong ai biet vi sao — nen tu tim lay.
 *
 * Dung dau gach xuoi ke ca tren Windows: Node hieu ca hai, con dau gach nguoc
 * trong chuoi JavaScript la ky tu thoat, rat de viet sai ma khong bao loi.
 */
function findJdk() {
  const seen = []
  if (process.env.JAVA_HOME && isJdk(process.env.JAVA_HOME)) seen.push(process.env.JAVA_HOME)

  const parents = isWindows
    ? [
        'C:/Program Files/Eclipse Adoptium',
        'C:/Program Files/Java',
        'C:/Program Files/Microsoft',
        'C:/Program Files/Android',
        'C:/Program Files/JetBrains',
      ]
    : ['/usr/lib/jvm', '/Library/Java/JavaVirtualMachines', '/opt/homebrew/opt', '/Applications']

  for (const parent of parents) {
    if (!existsSync(parent)) continue
    for (const entry of readdirSync(parent)) {
      const dir = join(parent, entry)
      // Ban cai truc tiep, JDK di kem IDE, va kieu bo cuc cua macOS
      for (const nested of [dir, join(dir, 'jbr'), join(dir, 'Contents', 'Home'), join(dir, 'Contents', 'jbr', 'Contents', 'Home')]) {
        if (isJdk(nested)) seen.push(nested)
      }
    }
  }

  const usable = seen
    .filter((d) => existsSync(d))
    .map((d) => ({ dir: d, major: majorVersion(d) }))
    .filter((d) => d.major >= 17)
    .sort((a, b) => a.major - b.major)

  return usable[0]?.dir
}

/**
 * Tim thu muc Android SDK.
 *
 * Cung mot ly do voi findJdk: thu muc android/ duoc sinh lai moi lan `cap sync`
 * nen local.properties khong ton tai lau, va thieu no thi Gradle bao loi o giua
 * chung build chu khong bao luc bat dau.
 */
function findSdk() {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? ''
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : null,
    home ? join(home, 'Library', 'Android', 'sdk') : null,
    home ? join(home, 'Android', 'Sdk') : null,
  ].filter(Boolean)
  return candidates.find((c) => existsSync(join(c, 'platform-tools')))
}

const jdk = findJdk()
const sdk = findSdk()
if (!sdk) console.warn('Không tìm thấy Android SDK; đặt ANDROID_HOME hoặc android/local.properties.')
else if (sdk !== process.env.ANDROID_HOME) console.log(`Dùng Android SDK: ${sdk}`)
if (!jdk) console.warn('Không tìm thấy JDK 17+; Gradle sẽ dùng java trong PATH và có thể báo lỗi.')
else if (jdk !== process.env.JAVA_HOME) console.log(`Dùng JDK: ${jdk}`)

// Tu Node 18.20, spawn thang mot file .bat se bao EINVAL — bat buoc phai qua shell.
// Doi tuong goi la wrapper co dinh cua du an, khong phai chuoi tu nguoi dung nhap.
const args = process.argv.slice(2)
const result = spawnSync(wrapper, args, {
  cwd: dir,
  stdio: 'inherit',
  shell: isWindows,
  env: {
    ...process.env,
    ...(jdk ? { JAVA_HOME: jdk } : {}),
    ...(sdk ? { ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk } : {}),
  },
})

if (result.error) {
  console.error('Không chạy được Gradle:', result.error.message)
  process.exit(1)
}
process.exit(result.status ?? 1)
