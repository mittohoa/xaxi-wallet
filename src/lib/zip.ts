/**
 * Bo dong goi ZIP toi gian, khong dung thu vien ngoai.
 *
 * Chi co MOT ly do de ton tai: anh bien lai khong nam trong ban sao luu JSON
 * (xem chu thich cua `Attachment`), nen phai co duong mang chung sang may khac
 * bang tay. Mot thu muc anh roi rac thi khong tai duoc tu WebView; mot tep duy
 * nhat thi duoc.
 *
 * Dung phuong thuc "store" — khong nen. Anh da la WebP/JPEG roi, nen lai chi
 * ton CPU ma gan nhu khong bot byte nao. Nho vay ca bo nay gon trong mot tep va
 * khong keo them phu thuoc nao vao du an.
 */

/** Bang tra CRC-32, dung lai cho moi lan goi */
let crcTable: Uint32Array | null = null

function table(): Uint32Array {
  if (crcTable) return crcTable
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  crcTable = t
  return t
}

export function crc32(bytes: Uint8Array): number {
  const t = table()
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Ngay gio kieu MS-DOS mà dinh dang ZIP doi hoi (do chinh xac 2 giay) */
function dosStamp(at: number): { time: number; date: number } {
  const d = new Date(at)
  const year = Math.max(1980, d.getFullYear())
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

export interface ZipEntry {
  /** duong dan trong tep nen, dung dau `/` */
  name: string
  bytes: Uint8Array
  /** moc thoi gian, mac dinh la luc dong goi */
  at?: number
}

function writer(size: number) {
  const buf = new Uint8Array(size)
  const view = new DataView(buf.buffer)
  let at = 0
  return {
    buf,
    get offset() {
      return at
    },
    u16(v: number) {
      view.setUint16(at, v, true)
      at += 2
    },
    u32(v: number) {
      view.setUint32(at, v >>> 0, true)
      at += 4
    },
    raw(v: Uint8Array) {
      buf.set(v, at)
      at += v.length
    },
  }
}

/**
 * Gop cac muc thanh mot tep ZIP.
 *
 * Co bat co UTF-8 (bit 11) nen ten tep tieng Viet doc dung tren Windows.
 * Khong ho tro Zip64 — muc va tong dung luong phai duoi 4GB, dieu luon dung
 * voi mot bo anh bien lai da nen.
 */
export function zipStore(entries: ZipEntry[], now = Date.now()): Blob {
  const encoder = new TextEncoder()
  const prepared = entries.map((e) => ({
    name: encoder.encode(e.name),
    bytes: e.bytes,
    crc: crc32(e.bytes),
    stamp: dosStamp(e.at ?? now),
  }))

  const localSize = prepared.reduce((n, e) => n + 30 + e.name.length + e.bytes.length, 0)
  const centralSize = prepared.reduce((n, e) => n + 46 + e.name.length, 0)
  const out = writer(localSize + centralSize + 22)

  const offsets: number[] = []
  for (const e of prepared) {
    offsets.push(out.offset)
    out.u32(0x04034b50)
    out.u16(20) // phien ban toi thieu de giai nen
    out.u16(0x0800) // ten tep la UTF-8
    out.u16(0) // khong nen
    out.u16(e.stamp.time)
    out.u16(e.stamp.date)
    out.u32(e.crc)
    out.u32(e.bytes.length)
    out.u32(e.bytes.length)
    out.u16(e.name.length)
    out.u16(0)
    out.raw(e.name)
    out.raw(e.bytes)
  }

  const centralStart = out.offset
  prepared.forEach((e, i) => {
    out.u32(0x02014b50)
    out.u16(20) // he tao ra
    out.u16(20)
    out.u16(0x0800)
    out.u16(0)
    out.u16(e.stamp.time)
    out.u16(e.stamp.date)
    out.u32(e.crc)
    out.u32(e.bytes.length)
    out.u32(e.bytes.length)
    out.u16(e.name.length)
    out.u16(0) // khong co truong phu
    out.u16(0) // khong co chu thich
    out.u16(0) // so dia
    out.u16(0) // thuoc tinh trong
    out.u32(0) // thuoc tinh ngoai
    out.u32(offsets[i])
    out.raw(e.name)
  })

  // Phai chot truoc khi ghi phan duoi, khong thi do dai tinh ra du 12 byte
  const centralEnd = out.offset

  out.u32(0x06054b50)
  out.u16(0)
  out.u16(0)
  out.u16(prepared.length)
  out.u16(prepared.length)
  out.u32(centralEnd - centralStart)
  out.u32(centralStart)
  out.u16(0)

  return new Blob([out.buf], { type: 'application/zip' })
}
