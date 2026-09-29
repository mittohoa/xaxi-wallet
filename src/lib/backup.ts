import { db } from '../db/db'
import { shareNativeFile } from './native/shell'
import { purgeOrphans } from './attachments'
import type { BackupFile, Category, Transaction, Wallet } from '../types'
import { formatDate } from './date'

/**
 * Ban 2 them bang `goals`.
 *
 * Khong pha ban cu: tep ban 1 khong co truong do va duoc doc thanh mang rong.
 */
export const BACKUP_VERSION = 2

export async function buildBackup(): Promise<BackupFile> {
  const [categories, wallets, transactions, budgets, dayMarks, templates, recurring, settings, goals] = await Promise.all([
    db.categories.toArray(),
    db.wallets.toArray(),
    db.transactions.toArray(),
    db.budgets.toArray(),
    db.dayMarks.toArray(),
    db.templates.toArray(),
    db.recurring.toArray(),
    db.settings.toArray(),
    db.goals.toArray(),
  ])
  return {
    app: 'xaxi',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: { categories, wallets, transactions, budgets, dayMarks, templates, recurring, settings, goals },
  }
}

/**
 * Nap lai toan bo du lieu tu file sao luu.
 * Ghi de sach de ID trong file khop voi ID trong DB (tranh giao dich mo coi).
 */
export async function restoreBackup(file: BackupFile): Promise<void> {
  if (file?.app !== 'xaxi') throw new Error('Tệp không phải bản sao lưu của XAXI.')
  if (typeof file.version !== 'number' || file.version > BACKUP_VERSION) {
    throw new Error('Tệp sao lưu thuộc phiên bản mới hơn ứng dụng.')
  }
  const d = file.data ?? ({} as BackupFile['data'])
  await db.transaction(
    'rw',
    [db.categories, db.wallets, db.transactions, db.budgets, db.dayMarks, db.templates, db.recurring, db.settings, db.goals],
    async () => {
      await Promise.all([
        db.categories.clear(),
        db.wallets.clear(),
        db.transactions.clear(),
        db.budgets.clear(),
        db.dayMarks.clear(),
        db.templates.clear(),
        db.recurring.clear(),
        db.settings.clear(),
        db.goals.clear(),
      ])
      await Promise.all([
        db.categories.bulkAdd(d.categories ?? []),
        db.wallets.bulkAdd(d.wallets ?? []),
        db.transactions.bulkAdd(d.transactions ?? []),
        db.budgets.bulkAdd(d.budgets ?? []),
        db.dayMarks.bulkAdd(d.dayMarks ?? []),
        db.templates.bulkAdd(d.templates ?? []),
        db.recurring.bulkAdd(d.recurring ?? []),
        db.settings.bulkAdd(d.settings ?? []),
        db.goals.bulkAdd(d.goals ?? []),
      ])
    },
  )
  // Ban sao luu thay toan bo bang giao dich, nen anh cu gan nhu chac chan
  // mo coi. Khong don thi chung nam lai vinh vien ma khong man hinh nao mo duoc.
  await purgeOrphans()
}

const CSV_HEADER = ['Ngày', 'Loại', 'Số tiền', 'Danh mục', 'Ví', 'Ghi chú', 'Ước tính', 'Nguồn']

function csvCell(value: string | number): string {
  const s = String(value ?? '')
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Nhập tay',
  quick: 'Nhập nhanh',
  recurring: 'Định kỳ',
  reconcile: 'Đối soát',
}

export function toCSV(txs: Transaction[], categories: Category[], wallets: Wallet[]): string {
  const catById = new Map(categories.map((c) => [c.id, c]))
  const walById = new Map(wallets.map((w) => [w.id, w]))
  const rows = [...txs]
    .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date.localeCompare(b.date)))
    .map((t) =>
      [
        formatDate(t.date),
        t.kind === 'income' ? 'Thu' : 'Chi',
        t.amount,
        catById.get(t.categoryId)?.name ?? '(đã xoá)',
        walById.get(t.walletId)?.name ?? '(đã xoá)',
        t.note ?? '',
        t.estimated ? 'x' : '',
        SOURCE_LABEL[t.source ?? 'manual'] ?? '',
      ]
        .map(csvCell)
        .join(','),
    )
  // BOM de Excel doc dung tieng Viet
  return '\ufeff' + [CSV_HEADER.join(','), ...rows].join('\r\n')
}

export function downloadFile(filename: string, content: string, mime: string): Promise<void> {
  return downloadBlob(filename, new Blob([content], { type: `${mime};charset=utf-8` }))
}

/**
 * Dua mot tep ra khoi app.
 *
 * Hai duong hoan toan khac nhau, va chuyen nay tung lam hong ca tinh nang:
 *
 * - Tren Android phai nho lop native. The <a download> tro toi blob URL KHONG
 *   duoc WebView xu ly — khong tep nao duoc tao, ma lop web van chay tiep va
 *   bao "da xuat ban sao luu". Nguoi dung tin la minh co ban sao luu, thuc ra
 *   khong co gi. Do la kieu hong tham lang nhat trong ca app nay.
 *
 * - Tren trinh duyet thi the <a download> lai la cach dung.
 */
export async function downloadBlob(filename: string, blob: Blob): Promise<void> {
  if (await shareNativeFile(filename, blob)) return

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Không đọc được tệp.'))
    reader.readAsText(file, 'utf-8')
  })
}
