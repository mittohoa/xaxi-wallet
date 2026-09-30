/**
 * Chen intent-filter ACTION_SEND vao AndroidManifest do Capacitor sinh ra,
 * de XAXI xuat hien trong menu Chia se cua Android (dan bien lai khong can copy tay).
 *
 * Thu muc android/ duoc sinh lai moi lan chay `cap add android` nen khong commit duoc;
 * script nay chay sau moi lan sinh. Goi nhieu lan khong sao — co kiem tra truoc khi chen.
 *
 * Nhan CA hai kieu:
 *   text/plain  — noi dung thong bao ngan hang, tin nhan bien dong so du
 *   image/*     — anh chup man hinh giao dich tu app bank / vi dien tu
 *
 * KHONG them quyen nao. ACTION_SEND la intent-filter, khong phai permission:
 * he dieu hanh chi chuyen du lieu toi app khi nguoi dung chu dong bam Chia se,
 * va ben gui tu cap quyen doc tam cho dung tep do.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const MANIFEST = process.argv[2] ?? 'android/app/src/main/AndroidManifest.xml'

/** Dong mimeType cho anh; tach rieng vi con dung de nang cap manifest da co san */
const IMAGE_MIME = '                <data android:mimeType="image/*" />'
const TEXT_MIME = '                <data android:mimeType="text/plain" />'

const INTENT_FILTER = `
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
${TEXT_MIME}
${IMAGE_MIME}
            </intent-filter>
`

/** Cac quyen khong bao gio duoc phep xuat hien — app cam ket khong dung */
const FORBIDDEN_PERMISSIONS = [
  'android.permission.READ_SMS',
  'android.permission.RECEIVE_SMS',
  'android.permission.RECEIVE_MMS',
  'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
  'android.permission.BIND_ACCESSIBILITY_SERVICE',
  'android.permission.PACKAGE_USAGE_STATS',
]

export function patchManifest(xml) {
  for (const permission of FORBIDDEN_PERMISSIONS) {
    if (xml.includes(permission)) {
      throw new Error(`Manifest chứa quyền bị cấm: ${permission}. XAXI cam kết không đụng tới quyền hệ thống.`)
    }
  }

  /*
   * Da co intent-filter SEND thi VAN phai kiem no co du kieu chua.
   *
   * Cho nay tung tra ve ngay "khong doi gi" — tuong la an toan vi goi nhieu lan
   * khong sao. Nhung khi them image/* vao khuon mau, dong do khong bao gio duoc
   * ap len manifest da co san: XAXI khong hien trong bang Chia se ANH.
   *
   * Va lo hong bi chinh cach thu che di: `am start -n` chi dinh thang component
   * thi Android khong can khop intent-filter nao ca, nen duong do van chay.
   */
  if (xml.includes('android.intent.action.SEND')) {
    if (xml.includes('image/*') || !xml.includes(TEXT_MIME)) return { xml, changed: false }
    return { xml: xml.replace(TEXT_MIME, `${TEXT_MIME}\n${IMAGE_MIME}`), changed: true }
  }

  // Tim the </activity> dau tien sau khai bao MainActivity
  const activityStart = xml.search(/<activity\b[^>]*android:name="\.MainActivity"/s)
  if (activityStart < 0) throw new Error('Không tìm thấy khai báo MainActivity trong AndroidManifest.')

  const closeIndex = xml.indexOf('</activity>', activityStart)
  if (closeIndex < 0) throw new Error('Khai báo MainActivity không có thẻ đóng </activity>.')

  return { xml: xml.slice(0, closeIndex) + INTENT_FILTER + '        ' + xml.slice(closeIndex), changed: true }
}

// Chi chay khi duoc goi truc tiep tu dong lenh, khong chay khi bi import trong test
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const original = readFileSync(MANIFEST, 'utf8')
  const { xml, changed } = patchManifest(original)
  if (changed) {
    writeFileSync(MANIFEST, xml, 'utf8')
    console.log(`Đã thêm intent-filter ACTION_SEND vào ${MANIFEST}`)
  } else {
    console.log(`${MANIFEST} đã có intent-filter ACTION_SEND, bỏ qua.`)
  }
}
