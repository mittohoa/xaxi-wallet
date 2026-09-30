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

/**
 * Quyen micro cho viec doc chinh ta. Day la quyen xin LUC DUNG, khong phai luc
 * cai, va am thanh khong bao gio duoc ghi ra tep.
 */
const RECORD_AUDIO = `    <uses-permission android:name="android.permission.RECORD_AUDIO" />
`

/**
 * Tu Android 11, app phai khai bao truoc moi nhin thay duoc dich vu nhan dang
 * giong noi cua he thong. Thieu khoi nay thi SpeechRecognizer luon bao khong
 * co san du may van co.
 */
const SPEECH_QUERIES = `    <queries>
        <intent>
            <action android:name="android.speech.RecognitionService" />
        </intent>
    </queries>
`

/**
 * Tien ich man hinh chinh.
 *
 * `exported="false"` la dung theo tai lieu chinh thuc cho API 31 tro len: he
 * dieu hanh van gui duoc APPWIDGET_UPDATE, con cac app khac thi khong goi toi
 * duoc. KHONG them quyen nao.
 */
const WIDGET_RECEIVER = `        <receiver
            android:name=".XaxiWidget"
            android:exported="false">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/xaxi_widget_info" />
        </receiver>
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

/**
 * Cau hinh ky so cho ban phat hanh.
 *
 * Khoa ky KHONG nam trong repo. Build doc tu android/keystore.properties —
 * tep do bi gitignore, va neu khong co thi ban release van build duoc nhung
 * chua ky, de nguoi dung tu ky sau.
 */
const SIGNING_BLOCK = `
    signingConfigs {
        release {
            // Doc tu android/keystore.properties neu co; xem README muc Android
            def props = new Properties()
            def file = rootProject.file('keystore.properties')
            if (file.exists()) {
                props.load(new FileInputStream(file))
                storeFile rootProject.file(props['storeFile'])
                storePassword props['storePassword']
                keyAlias props['keyAlias']
                keyPassword props['keyPassword']
            }
        }
    }
`

function patchGradleSigning() {
  const path = join(TARGET, 'app', 'build.gradle')
  let text = readFileSync(path, 'utf8')
  const changes = []

  if (!text.includes('signingConfigs {')) {
    const marker = text.indexOf('android {')
    const insertAt = text.indexOf('\n', marker) + 1
    text = text.slice(0, insertAt) + SIGNING_BLOCK + text.slice(insertAt)
    changes.push('khối signingConfigs đọc từ keystore.properties')
  }

  // Ban release: ky so + rut gon ma, nhung chi khi that su co khoa
  if (!text.includes('signingConfig signingConfigs.release')) {
    text = text.replace(
      /buildTypes \{\s*release \{/,
      `buildTypes {
        release {
            if (rootProject.file('keystore.properties').exists()) {
                signingConfig signingConfigs.release
            }`,
    )
    changes.push('bản release dùng khoá ký khi có')
  }

  if (text.includes('minifyEnabled false')) {
    text = text.replace('minifyEnabled false', 'minifyEnabled true\n            shrinkResources true')
    changes.push('bật rút gọn mã và tài nguyên cho bản release')
  }

  /*
   * Ky ban debug bang khoa PHAT HANH — chi khi duoc yeu cau ro rang.
   *
   * VI SAO CAN: bo ra `npm run device:check` lai qua cong go loi WebView, ma
   * ban phat hanh co y tat cong do. Cai ban debug de len thi Android tu choi vi
   * khac chu ky, con go app ra la XOA SACH du lieu tai chinh that cua nguoi
   * dung. Ky cung mot khoa thi cai de duoc, giu nguyen du lieu, va bo ra chay
   * duoc tren chinh may that.
   *
   * VI SAO PHAI CO CONG BAT: mot ban debug ky bang khoa phat hanh la mot ban
   * cap nhat hop le cua app that — no mo cong go loi va khong rut gon ma. De
   * mac dinh thi som muon co ban nhu vay di ra ngoai. Bien moi truong bat buoc
   * bien no thanh mot viec phai co y lam.
   */
  if (!text.includes('XAXI_DEBUG_RELEASE_SIGNED')) {
    text = text.replace(
      /buildTypes \{/,
      `buildTypes {
        debug {
            if (System.getenv('XAXI_DEBUG_RELEASE_SIGNED') == '1' && rootProject.file('keystore.properties').exists()) {
                signingConfig signingConfigs.release
            }
        }`,
    )
    changes.push('ban debug ky bang khoa phat hanh khi XAXI_DEBUG_RELEASE_SIGNED=1')
  }

  if (changes.length) writeFileSync(path, text, 'utf8')
  return changes
}

function patchManifestForVoice() {
  const path = join(TARGET, 'app', 'src', 'main', 'AndroidManifest.xml')
  let text = readFileSync(path, 'utf8')
  const changes = []

  if (!text.includes('android.permission.RECORD_AUDIO')) {
    const close = text.indexOf('</manifest>')
    text = text.slice(0, close) + RECORD_AUDIO + text.slice(close)
    changes.push('quyền RECORD_AUDIO (xin lúc dùng)')
  }

  if (!text.includes('android.speech.RecognitionService')) {
    const close = text.indexOf('</manifest>')
    text = text.slice(0, close) + SPEECH_QUERIES + text.slice(close)
    changes.push('khai báo <queries> để thấy dịch vụ nhận dạng giọng nói')
  }

  if (changes.length) writeFileSync(path, text, 'utf8')
  return changes
}

function patchManifestForWidget() {
  const path = join(TARGET, 'app', 'src', 'main', 'AndroidManifest.xml')
  let text = readFileSync(path, 'utf8')
  if (text.includes('.XaxiWidget')) return false

  const close = text.lastIndexOf('</application>')
  if (close < 0) throw new Error('AndroidManifest.xml không có thẻ đóng </application>')
  text = text.slice(0, close) + WIDGET_RECEIVER + text.slice(close)
  writeFileSync(path, text, 'utf8')
  return true
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

console.log(
  patchManifestForWidget()
    ? 'Đã đăng ký tiện ích màn hình chính.'
    : 'Manifest đã có tiện ích màn hình chính.',
)

const signingChanges = patchGradleSigning()
if (signingChanges.length) {
  console.log('Đã cấu hình bản phát hành:')
  for (const c of signingChanges) console.log(`  ${c}`)
} else {
  console.log('build.gradle đã đủ cấu hình phát hành.')
}

const voiceChanges = patchManifestForVoice()
if (voiceChanges.length) {
  console.log('Đã thêm vào manifest cho phần giọng nói:')
  for (const c of voiceChanges) console.log(`  ${c}`)
} else {
  console.log('Manifest đã đủ khai báo cho phần giọng nói.')
}
