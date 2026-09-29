/**
 * Doc file Excel (.xlsx) ma KHONG dung thu vien ngoai.
 *
 * .xlsx thuc chat la mot file ZIP chua vai file XML. Trinh duyet hien dai da co
 * san `DecompressionStream('deflate-raw')` de giai nen, va `DOMParser` de doc XML —
 * nen toan bo viec nay lam duoc bang API co san, khong ton them mot byte bundle nao.
 *
 * Chi doc, khong ghi. Va chi lay dung nhung gi can cho viec nhap sao ke:
 * o gia tri cua sheet dau tien.
 */

/* ---------------- ZIP ---------------- */

interface ZipEntry {
  name: string
  compressionMethod: number
  compressedSize: number
  localHeaderOffset: number
}

function readU16(view: DataView, offset: number): number {
  return view.getUint16(offset, true)
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true)
}

/** Tim End Of Central Directory — nam o cuoi file, co the co comment dai toi 64KB */
function findEOCD(view: DataView): number {
  const max = Math.min(view.byteLength, 65_557)
  for (let i = view.byteLength - 22; i >= view.byteLength - max; i--) {
    if (i < 0) break
    if (readU32(view, i) === 0x06054b50) return i
  }
  return -1
}

function readCentralDirectory(buffer: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buffer)
  const eocd = findEOCD(view)
  if (eocd < 0) throw new Error('Tệp không phải định dạng Excel (.xlsx) hợp lệ.')

  const count = readU16(view, eocd + 10)
  let offset = readU32(view, eocd + 16)
  const entries: ZipEntry[] = []
  const decoder = new TextDecoder('utf-8')

  for (let i = 0; i < count; i++) {
    if (readU32(view, offset) !== 0x02014b50) break
    const compressionMethod = readU16(view, offset + 10)
    const compressedSize = readU32(view, offset + 20)
    const nameLength = readU16(view, offset + 28)
    const extraLength = readU16(view, offset + 30)
    const commentLength = readU16(view, offset + 32)
    const localHeaderOffset = readU32(view, offset + 42)
    const name = decoder.decode(new Uint8Array(buffer, offset + 46, nameLength))
    entries.push({ name, compressionMethod, compressedSize, localHeaderOffset })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function readEntry(buffer: ArrayBuffer, entry: ZipEntry): Promise<string> {
  const view = new DataView(buffer)
  const base = entry.localHeaderOffset
  if (readU32(view, base) !== 0x04034b50) throw new Error('Cấu trúc tệp Excel bị hỏng.')
  const nameLength = readU16(view, base + 26)
  const extraLength = readU16(view, base + 28)
  const start = base + 30 + nameLength + extraLength
  const raw = new Uint8Array(buffer, start, entry.compressedSize)

  const bytes = entry.compressionMethod === 0 ? raw : await inflate(raw)
  return new TextDecoder('utf-8').decode(bytes)
}

/* ---------------- XLSX ---------------- */

/** 'BC12' -> 54 (chi so cot, bat dau tu 0) */
function columnIndex(ref: string): number {
  let n = 0
  for (const ch of ref) {
    const code = ch.charCodeAt(0)
    if (code < 65 || code > 90) break
    n = n * 26 + (code - 64)
  }
  return n - 1
}

/**
 * Excel luu ngay duoi dang so seri. Moc la 1899-12-30 vi Excel coi nham
 * nam 1900 la nam nhuan — tru di 1 ngay so voi moc 1899-12-31.
 */
export function excelSerialToISO(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return null
  const ms = Math.round(serial) * 86_400_000
  const d = new Date(Date.UTC(1899, 11, 30) + ms)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getUTCFullYear()
  const m = `${d.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${d.getUTCDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseXML(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('Không đọc được nội dung tệp Excel.')
  return doc
}

function readSharedStrings(xml: string): string[] {
  const doc = parseXML(xml)
  return [...doc.getElementsByTagName('si')].map((si) => {
    // Mot o chu co the bi tach thanh nhieu doan <t> khi co dinh dang khac nhau
    const parts = [...si.getElementsByTagName('t')].map((t) => t.textContent ?? '')
    return parts.join('')
  })
}

export interface XlsxSheet {
  name: string
  rows: string[][]
}

/**
 * Doc sheet dau tien thanh bang chuoi.
 * O ngay duoc doi tu so seri sang 'YYYY-MM-DD' de bo doc sao ke nhan ra ngay.
 */
export async function readXlsx(file: ArrayBuffer): Promise<XlsxSheet> {
  const entries = readCentralDirectory(file)
  const byName = new Map(entries.map((e) => [e.name, e]))

  const workbookEntry = byName.get('xl/workbook.xml')
  if (!workbookEntry) throw new Error('Tệp Excel thiếu phần workbook.')

  // Ten sheet dau tien, chi de hien cho nguoi dung doi chieu
  let sheetName = 'Sheet1'
  try {
    const wb = parseXML(await readEntry(file, workbookEntry))
    sheetName = wb.getElementsByTagName('sheet')[0]?.getAttribute('name') ?? sheetName
  } catch {
    /* ten sheet khong quan trong toi muc phai dung lai */
  }

  const sharedEntry = byName.get('xl/sharedStrings.xml')
  const shared = sharedEntry ? readSharedStrings(await readEntry(file, sharedEntry)) : []

  const sheetEntry =
    byName.get('xl/worksheets/sheet1.xml') ??
    entries.find((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name))
  if (!sheetEntry) throw new Error('Tệp Excel không có bảng tính nào.')

  const doc = parseXML(await readEntry(file, sheetEntry))
  const rows: string[][] = []

  for (const row of [...doc.getElementsByTagName('row')]) {
    const cells: string[] = []
    for (const c of [...row.getElementsByTagName('c')]) {
      const ref = c.getAttribute('r') ?? ''
      const index = ref ? columnIndex(ref) : cells.length
      const type = c.getAttribute('t')

      let value = ''
      if (type === 'inlineStr') {
        value = [...c.getElementsByTagName('t')].map((t) => t.textContent ?? '').join('')
      } else {
        const v = c.getElementsByTagName('v')[0]?.textContent ?? ''
        if (type === 's') value = shared[Number(v)] ?? ''
        else value = v
      }

      // O co dinh dang ngay: Excel luu so seri, doi lai cho de doc
      const styleIndex = c.getAttribute('s')
      if (!type && styleIndex && /^\d+(\.\d+)?$/.test(value)) {
        const iso = excelSerialToISO(Number(value))
        // Chi doi khi con so nam trong khoang ngay thuc te (tu nam 1990 tro di)
        if (iso && Number(value) > 32_800) value = iso
      }

      while (cells.length < index) cells.push('')
      cells[index] = value
    }
    rows.push(cells)
  }

  return { name: sheetName, rows }
}
