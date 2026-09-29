/**
 * Chep ma native tu android-native/ vao du an Android do Capacitor sinh ra,
 * va them cac phu thuoc can thiet vao build.gradle.
 *
 * Thu muc android/ bi sinh lai moi lan chay `cap sync` nen khong commit duoc;
 * nguon that nam o android-native/ va duoc chep de len sau moi lan dong bo.
 *
 * Goi nhieu lan khong sao — moi thay doi deu co kiem tra truoc khi ghi.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const SOURCE = resolve('android-native')
const TARGET = resolve('android')

/** Phu thuoc dang unbundled: mo hinh do Google Play Services tai ve sau khi cai app */
const GRADLE_DEPENDENCIES = [
  {
    line: "implementation 'com.google.android.gms:play-services-mlkit-text-recognition:19.0.1'",
    why: 'ML Kit đọc chữ (bản unbundled — model tải sau khi cài, APK không phình)',
  },
]

/**
 * Bao Play Services tai san mo hinh ngay sau khi cai app, thay vi cho toi luc
 * nguoi dung bam chup lan dau roi phai doi.
 */
const MLKIT_META = `        <meta-data
            android:name="com.google.mlkit.vision.DEPENDENCIES"
            android:value="ocr" />
`

function copyTree(from, to) {
  const copied = []
  for (const entry of readdirSync(from)) {
    const source = join(from, entry)
    const target = join(to, entry)
    if (statSync(source).isDirectory()) {
      copied.push(...copyTree(source, target))
    } else {
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(source, target)
      copied.push(relative(TARGET, target).replace(/\\/g, '/'))
    }
  }
  return copied
}

function patchGradle() {
  const path = join(TARGET, 'app', 'build.gradle')
  if (!existsSync(path)) throw new Error('Không tìm thấy android/app/build.gradle')
  let text = readFileSync(path, 'utf8')

  const missing = GRADLE_DEPENDENCIES.filter((d) => !text.includes(d.line))
  if (missing.length === 0) return []

  // Chen vao khoi dependencies dau tien
  const marker = text.indexOf('dependencies {')
  if (marker < 0) throw new Error('build.gradle không có khối dependencies')
  const insertAt = text.indexOf('\n', marker) + 1

  const block = missing.map((d) => `    // ${d.why}\n    ${d.line}\n`).join('')
  text = text.slice(0, insertAt) + block + text.slice(insertAt)
  writeFileSync(path, text, 'utf8')
  return missing.map((d) => d.line)
}

function patchManifestForMlKit() {
  const path = join(TARGET, 'app', 'src', 'main', 'AndroidManifest.xml')
  if (!existsSync(path)) throw new Error('Không tìm thấy AndroidManifest.xml')
  let text = readFileSync(path, 'utf8')
  if (text.includes('com.google.mlkit.vision.DEPENDENCIES')) return false

  const close = text.lastIndexOf('</application>')
  if (close < 0) throw new Error('AndroidManifest.xml không có thẻ đóng </application>')
  text = text.slice(0, close) + MLKIT_META + text.slice(close)
  writeFileSync(path, text, 'utf8')
  return true
}

if (!existsSync(TARGET)) {
  console.error('Chưa có thư mục android/. Chạy `npm run android:add` trước.')
  process.exit(1)
}

const files = copyTree(SOURCE, TARGET)
console.log(`Đã chép ${files.length} tệp mã native:`)
for (const f of files) console.log(`  ${f}`)

const added = patchGradle()
if (added.length) {
  console.log('Đã thêm phụ thuộc vào build.gradle:')
  for (const line of added) console.log(`  ${line}`)
} else {
  console.log('build.gradle đã có đủ phụ thuộc.')
}

console.log(
  patchManifestForMlKit()
    ? 'Đã khai báo tải sẵn mô hình OCR qua Google Play Services.'
    : 'Manifest đã khai báo tải mô hình OCR.',
)
