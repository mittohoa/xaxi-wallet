/**
 * Sinh service worker cho ban web sau khi vite build xong.
 *
 * Vi sao khong dung thu vien PWA co san: danh sach tep can luu san phai khop
 * voi ten tep co ma bam do vite sinh ra, va thu duy nhat biet danh sach do la
 * chinh thu muc dist sau khi build. Doc no truc tiep gon hon la cau hinh mot
 * bo sinh, va khong them phu thuoc nao — dung tinh than cua phan con lai trong
 * du an (bo doc xlsx, bo dong goi zip deu tu viet).
 *
 * Ban web la ban DUY NHAT can den service worker. Android chay qua Capacitor
 * da co san toan bo tep trong APK roi; dang ky them mot lop cache nua o do chi
 * tao ra kha nang phuc vu ban cu sau khi cap nhat app.
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const DIST = resolve('dist')

/** Tep khong can luu san: chinh service worker, va nhung thu chi dung luc phat trien */
const SKIP = new Set(['sw.js', '.vite'])

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(relative(DIST, full).replace(/\\/g, '/'))
  }
  return out
}

const files = walk(DIST).sort()
if (!files.includes('index.html')) {
  console.error('Không thấy dist/index.html — chạy `vite build` trước.')
  process.exit(1)
}

/**
 * Phien ban = ma bam cua noi dung moi tep.
 *
 * Phai bam NOI DUNG chu khong phai ten tep: index.html khong co ma bam trong
 * ten, nen neu chi bam ten thi sua index.html xong service worker van tuong
 * khong co gi doi va tiep tuc phuc vu ban cu.
 */
const hash = createHash('sha256')
for (const f of files) {
  hash.update(f)
  hash.update(readFileSync(join(DIST, f)))
}
const version = hash.digest('hex').slice(0, 12)

const sw = `/* Sinh tu dong boi scripts/make-sw.mjs — dung sua tay */
const VERSION = ${JSON.stringify(version)}
const CACHE = 'xaxi-' + VERSION
const PRECACHE = ${JSON.stringify(files, null, 2)}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((f) => new Request(f, { cache: 'reload' }))))
      // Ban moi duoc kich hoat ngay; khong bat nguoi dung dong het tab moi thay
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

/**
 * Tep co ma bam trong ten thi noi dung khong bao gio doi — lay thang tu cache.
 * Moi thu khac uu tien mang, that bai moi rot ve cache.
 */
function isImmutable(url) {
  return /\\/assets\\/[^/]+-[A-Za-z0-9_-]{8,}\\.(js|css|woff2?|png|jpg|svg)$/.test(url.pathname)
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Dieu huong: luon co trang de hien, ke ca khi mat mang hoan toan
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE)
        return (await cache.match('index.html')) ?? Response.error()
      }),
    )
    return
  }

  if (isImmutable(url)) {
    event.respondWith(
      caches.match(request).then((hit) => hit ?? fetch(request)),
    )
    return
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
      .catch(async () => (await caches.match(request)) ?? Response.error()),
  )
})
`

writeFileSync(join(DIST, 'sw.js'), sw, 'utf8')

const bytes = files.reduce((n, f) => n + statSync(join(DIST, f)).size, 0)
console.log(`Đã sinh dist/sw.js — ${files.length} tệp lưu sẵn, ${(bytes / 1024).toFixed(0)}KB, phiên bản ${version}`)
