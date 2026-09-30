/**
 * Dựng toàn bộ biểu tượng PNG từ một nguồn hình duy nhất.
 *
 *   npm run icons:build
 *
 * VÌ SAO TỰ VIẾT: đổi logo xong thì Android đã đúng ngay (nó dùng vector), nhưng
 * PNG cho PWA và bản desktop thì nằm lại với nền cũ. Máy này không có bộ dựng
 * ảnh nào, và thêm một gói phụ thuộc chỉ để vẽ hai đường thẳng với một hình chữ
 * nhật bo góc là cái giá không đáng — cùng lý lẽ đã dùng cho ZIP, IMAP và MIME.
 *
 * Hình được vẽ THẲNG TỪ TOẠ ĐỘ, không đọc tệp SVG. Nhờ vậy không cần bộ phân
 * tích SVG, và các hằng số dưới đây là cùng một bộ với `brand/icon.svg`.
 *
 * Cách vẽ: mỗi điểm ảnh lấy nhiều mẫu con, mỗi mẫu hỏi ba câu — nằm trong khung
 * bo góc không, cách đường nét bao xa — rồi lấy trung bình. Không có thư viện đồ
 * hoạ nào, chỉ là hình học phẳng.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/* ================= hình, trong hệ toạ độ 512 ================= */

const S = 512
const RADIUS = 114
const STROKE = 58

const LIME = [0xb8, 0xff, 0x3d]
const INK = [0x0d, 0x11, 0x17]
const RED = [0xe3, 0x49, 0x48]

/** Đường tiền RA: gần phẳng rồi lao xuống */
const DUONG_RA = [
  [100, 120],
  [240, 160],
  [412, 400],
]

/** Đường tiền VÀO: gần phẳng rồi vọt lên. Vẽ SAU nên nằm trên khi hai đường cắt nhau */
const DUONG_VAO = [
  [100, 392],
  [240, 352],
  [412, 112],
]

/* ================= hình học ================= */

/** Khoảng cách từ một điểm tới một đoạn thẳng */
function toSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

/**
 * Khoảng cách tới cả đường gấp khúc.
 *
 * Lấy nhỏ nhất qua từng đoạn, và thế là ĐẦU TRÒN với GÓC TRÒN có sẵn — không
 * phải xử lý riêng: quanh mỗi điểm mút, tập hợp các điểm cách đều chính là một
 * hình tròn.
 */
function toPolyline(px, py, pts) {
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const d = toSegment(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])
    if (d < best) best = d
  }
  return best
}

/** Điểm có nằm trong hình vuông bo góc không */
function trongKhung(px, py) {
  const qx = Math.abs(px - S / 2) - (S / 2 - RADIUS)
  const qy = Math.abs(py - S / 2) - (S / 2 - RADIUS)
  const ngoai = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  return ngoai + Math.min(Math.max(qx, qy), 0) <= RADIUS
}

/* ================= vẽ ================= */

/** Số mẫu con mỗi chiều. 4 nghĩa là 16 mẫu cho một điểm ảnh — đủ mịn cho cạnh cong */
const MAU = 4

function ve(size) {
  const px = new Uint8Array(size * size * 4)
  const buoc = S / size
  const nua = STROKE / 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0

      for (let sy = 0; sy < MAU; sy++) {
        for (let sx = 0; sx < MAU; sx++) {
          const wx = (x + (sx + 0.5) / MAU) * buoc
          const wy = (y + (sy + 0.5) / MAU) * buoc

          if (!trongKhung(wx, wy)) continue

          // Đường VÀO vẽ sau nên thắng chỗ hai đường cắt nhau
          let mau = LIME
          if (toPolyline(wx, wy, DUONG_VAO) <= nua) mau = INK
          else if (toPolyline(wx, wy, DUONG_RA) <= nua) mau = RED

          r += mau[0]
          g += mau[1]
          b += mau[2]
          a += 255
        }
      }

      const n = MAU * MAU
      const i = (y * size + x) * 4
      // Chia cho SỐ MẪU CÓ MÀU, không phải tổng số mẫu: ngoài khung là trong
      // suốt, gộp vào thì cạnh bo góc bị viền tối
      const co = a / 255
      px[i] = co ? Math.round(r / co) : 0
      px[i + 1] = co ? Math.round(g / co) : 0
      px[i + 2] = co ? Math.round(b / co) : 0
      px[i + 3] = Math.round(a / n)
    }
  }
  return px
}

/* ================= đóng gói PNG ================= */

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function toPng(px, size) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // 8 bit mỗi kênh
  ihdr[9] = 6 // RGBA
  // 10..12: nén deflate, lọc chuẩn, không xen dòng

  // Mỗi hàng mở đầu bằng một byte kiểu lọc; 0 nghĩa là không lọc
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    const at = y * (size * 4 + 1)
    raw[at] = 0
    Buffer.from(px.buffer, px.byteOffset + y * size * 4, size * 4).copy(raw, at + 1)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * Gói nhiều PNG thành một tệp .ico.
 *
 * ICO vốn chứa ảnh bitmap thô, nhưng từ Windows Vista nó nhận thẳng PNG bên
 * trong — gọn hơn nhiều và không phải viết bộ mã hoá BMP thứ hai.
 */
function toIco(anh) {
  const head = Buffer.alloc(6)
  head.writeUInt16LE(0, 0)
  head.writeUInt16LE(1, 2) // 1 = biểu tượng
  head.writeUInt16LE(anh.length, 4)

  let offset = 6 + anh.length * 16
  const muc = []
  for (const { size, png } of anh) {
    const e = Buffer.alloc(16)
    e[0] = size >= 256 ? 0 : size // 0 nghĩa là 256
    e[1] = size >= 256 ? 0 : size
    e[4] = 1 // số mặt phẳng
    e.writeUInt16LE(32, 6) // bit mỗi điểm ảnh
    e.writeUInt32BE(0, 8)
    e.writeUInt32LE(png.length, 8)
    e.writeUInt32LE(offset, 12)
    muc.push(e)
    offset += png.length
  }
  return Buffer.concat([head, ...muc, ...anh.map((a) => a.png)])
}

/* ================= chạy ================= */

const CAN = [
  ['public/icon-192.png', 192],
  ['public/icon-512.png', 512],
  ['brand/png/icon-512.png', 512],
  ['src-tauri/icons/icon.png', 512],
  ['src-tauri/icons/32x32.png', 32],
  ['src-tauri/icons/64x64.png', 64],
  ['src-tauri/icons/128x128.png', 128],
  ['src-tauri/icons/128x128@2x.png', 256],
  ['src-tauri/icons/StoreLogo.png', 50],
  ['src-tauri/icons/Square30x30Logo.png', 30],
  ['src-tauri/icons/Square44x44Logo.png', 44],
  ['src-tauri/icons/Square71x71Logo.png', 71],
  ['src-tauri/icons/Square89x89Logo.png', 89],
  ['src-tauri/icons/Square107x107Logo.png', 107],
  ['src-tauri/icons/Square142x142Logo.png', 142],
  ['src-tauri/icons/Square150x150Logo.png', 150],
  ['src-tauri/icons/Square284x284Logo.png', 284],
  ['src-tauri/icons/Square310x310Logo.png', 310],
]

/** Cỡ nằm trong tệp .ico của Windows */
const ICO_SIZES = [16, 32, 48, 64, 128, 256]

const cache = new Map()
const png = (size) => {
  if (!cache.has(size)) cache.set(size, toPng(ve(size), size))
  return cache.get(size)
}

for (const [path, size] of CAN) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, png(size))
  console.log(`  ${path}  ${size}×${size}`)
}

const ico = toIco(ICO_SIZES.map((size) => ({ size, png: png(size) })))
writeFileSync('src-tauri/icons/icon.ico', ico)
console.log(`  src-tauri/icons/icon.ico  ${ICO_SIZES.join(', ')}`)

console.log('\nCHUA LAM: src-tauri/icons/icon.icns (chi dung khi dung ban macOS).')
