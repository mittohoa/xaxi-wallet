/**
 * Kiem thu bo doc .xlsx: dung mot file Excel that ngay trong test
 * (ZIP luu kieu 'stored', dung dinh dang chuan) roi doc lai bang bo doc cua app.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

// Bo doc can DOMParser — Node khong co san, muon tam cua jsdom
const dom = new JSDOM('<!doctype html><html><body></body></html>')
;(globalThis as Record<string, unknown>).DOMParser = dom.window.DOMParser

const { readXlsx, excelSerialToISO } = await import('../src/lib/xlsx')
const { parseStatementTable } = await import('../src/lib/statement')

/* ---------------- dung file .xlsx ---------------- */

interface ZipFile {
  name: string
  content: string
}

/** Ghi mot ZIP khong nen (method 0) — du de bo doc xu ly */
function buildZip(files: ZipFile[]): ArrayBuffer {
  const encoder = new TextEncoder()
  const encoded = files.map((f) => ({ name: encoder.encode(f.name), data: encoder.encode(f.content) }))

  const localSize = encoded.reduce((s, f) => s + 30 + f.name.length + f.data.length, 0)
  const centralSize = encoded.reduce((s, f) => s + 46 + f.name.length, 0)
  const buffer = new ArrayBuffer(localSize + centralSize + 22)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  const offsets: number[] = []
  let p = 0
  for (const f of encoded) {
    offsets.push(p)
    view.setUint32(p, 0x04034b50, true)
    view.setUint16(p + 4, 20, true) // version
    view.setUint16(p + 8, 0, true) // method 0 = stored
    view.setUint32(p + 14, 0, true) // crc (bộ đọc không kiểm)
    view.setUint32(p + 18, f.data.length, true)
    view.setUint32(p + 22, f.data.length, true)
    view.setUint16(p + 26, f.name.length, true)
    bytes.set(f.name, p + 30)
    bytes.set(f.data, p + 30 + f.name.length)
    p += 30 + f.name.length + f.data.length
  }

  const centralStart = p
  encoded.forEach((f, i) => {
    view.setUint32(p, 0x02014b50, true)
    view.setUint16(p + 10, 0, true)
    view.setUint32(p + 20, f.data.length, true)
    view.setUint32(p + 24, f.data.length, true)
    view.setUint16(p + 28, f.name.length, true)
    view.setUint32(p + 42, offsets[i], true)
    bytes.set(f.name, p + 46)
    p += 46 + f.name.length
  })

  view.setUint32(p, 0x06054b50, true)
  view.setUint16(p + 8, encoded.length, true)
  view.setUint16(p + 10, encoded.length, true)
  view.setUint32(p + 12, centralSize, true)
  view.setUint32(p + 16, centralStart, true)
  return buffer
}

const SHARED = ['Ngày giao dịch', 'Nội dung', 'Ghi nợ', 'Ghi có', 'THANH TOAN GRAB', 'LUONG THANG 9']

function sheetXml(): string {
  return `<?xml version="1.0"?><worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>
    <row r="2"><c r="A2" s="1"><v>46273</v></c><c r="B2" t="s"><v>4</v></c><c r="C2"><v>120000</v></c><c r="D2"></c></row>
    <row r="3"><c r="A3" s="1"><v>46274</v></c><c r="B3" t="s"><v>5</v></c><c r="C3"></c><c r="D3"><v>15000000</v></c></row>
  </sheetData></worksheet>`
}

function buildWorkbook(): ArrayBuffer {
  return buildZip([
    { name: 'xl/workbook.xml', content: '<?xml version="1.0"?><workbook><sheets><sheet name="Sao ke" sheetId="1"/></sheets></workbook>' },
    {
      name: 'xl/sharedStrings.xml',
      content: `<?xml version="1.0"?><sst>${SHARED.map((t) => `<si><t>${t}</t></si>`).join('')}</sst>`,
    },
    { name: 'xl/worksheets/sheet1.xml', content: sheetXml() },
  ])
}

/* ---------------- kiem thu ---------------- */

test('excelSerialToISO đổi đúng số seri của Excel sang ngày', () => {
  // 1 = 1899-12-31 theo cach Excel dem (co loi nam nhuan 1900)
  assert.equal(excelSerialToISO(46273), '2026-09-08')
  assert.equal(excelSerialToISO(45292), '2024-01-01')
  assert.equal(excelSerialToISO(0), null)
  assert.equal(excelSerialToISO(NaN), null)
})

test('readXlsx đọc được tên sheet, chuỗi dùng chung và ô ngày', async () => {
  const sheet = await readXlsx(buildWorkbook())
  assert.equal(sheet.name, 'Sao ke')
  assert.equal(sheet.rows.length, 3)

  assert.deepEqual(sheet.rows[0], ['Ngày giao dịch', 'Nội dung', 'Ghi nợ', 'Ghi có'])
  assert.equal(sheet.rows[1][0], '2026-09-08', 'ô ngày phải được đổi từ số seri')
  assert.equal(sheet.rows[1][1], 'THANH TOAN GRAB')
  assert.equal(sheet.rows[1][2], '120000')
  assert.equal(sheet.rows[2][3], '15000000')
})

test('bảng đọc từ Excel chạy thẳng vào bộ nhập sao kê', async () => {
  const sheet = await readXlsx(buildWorkbook())
  const parsed = parseStatementTable(sheet.rows, [], 'xlsx')
  assert.ok(parsed)
  assert.equal(parsed.source, 'xlsx')
  assert.equal(parsed.rows.length, 2)

  const chi = parsed.rows.find((r) => r.note === 'THANH TOAN GRAB')!
  assert.equal(chi.kind, 'expense')
  assert.equal(chi.amount, 120_000)
  assert.equal(chi.date, '2026-09-08')

  const thu = parsed.rows.find((r) => r.note === 'LUONG THANG 9')!
  assert.equal(thu.kind, 'income')
  assert.equal(thu.amount, 15_000_000)
})

test('bộ đọc từ chối tệp không phải xlsx thay vì trả về rác', async () => {
  const notZip = new TextEncoder().encode('đây không phải file excel').buffer
  await assert.rejects(() => readXlsx(notZip as ArrayBuffer), /không phải định dạng Excel/i)
})

test('dòng trùng với giao dịch đã có bị đánh dấu và bỏ chọn sẵn', async () => {
  const sheet = await readXlsx(buildWorkbook())
  const existing = [
    {
      id: 1,
      kind: 'expense' as const,
      amount: 120_000,
      categoryId: 1,
      walletId: 1,
      date: '2026-09-08',
      note: 'THANH TOAN GRAB',
      createdAt: 1,
    },
  ]
  const parsed = parseStatementTable(sheet.rows, existing, 'xlsx')!
  const chi = parsed.rows.find((r) => r.note === 'THANH TOAN GRAB')!
  assert.equal(chi.duplicate, true)
  assert.equal(chi.selected, false)
})
