/**
 * Anh bien lai dinh kem giao dich.
 *
 * Ba rang buoc dinh hinh toan bo tep nay:
 *
 * 1. Anh KHONG bao gio roi khoi may. Khong sao luu, khong dong bo, khong may
 *    chu. Dieu nay duoc bao dam bang cau truc: `Attachment` khong co truong
 *    dong bo nao, va bang `attachments` khong nam trong `SYNC_TABLES`.
 *
 * 2. Bo nho dien thoai la huu han. Anh may anh goc 3-5MB; giu nguyen thi mot
 *    nam ghi chep se an vai GB va dung ngay vao han muc cua WebView. Nen lai
 *    con khoang 8-10KB moi anh, tuc chung 16MB cho ca nam.
 *
 * 3. Anh goc mang theo EXIF: toa do GPS, kieu may, gio chup chinh xac. Ve lai
 *    qua canvas thi toan bo phan do bi bo — thu duoc luu chi con diem anh.
 */
import { db, newId } from '../db/db'
import type { Attachment, Id } from '../types'
import { zipStore, type ZipEntry } from './zip'

/**
 * Canh dai nhat sau khi thu nho.
 *
 * 1000px du de doc lai mat chu tren bien lai bang mat thuong, va du de bo doc
 * chu doc lai neu can. Len 1600px thi dung luong tang gan gap doi ma tren man
 * hinh dien thoai mat thuong khong thay khac gi.
 */
export const MAX_DIMENSION = 1000

/** WebP o muc nay van sac net voi anh chup giay; xuong nua thi chu bat dau nhoe */
export const QUALITY = 0.65

let webpChecked: boolean | null = null

/**
 * May nay co ma hoa duoc WebP khong.
 *
 * Phai hoi thay vi gia dinh: `toDataURL('image/webp')` tren may khong ho tro se
 * lang le tra ve PNG — tuc la anh phinh len thay vi nho di, ma khong bao loi.
 */
export function supportsWebP(): boolean {
  if (webpChecked !== null) return webpChecked
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    webpChecked = canvas.toDataURL('image/webp').startsWith('data:image/webp')
  } catch {
    webpChecked = false
  }
  return webpChecked
}

export interface CompressedImage {
  blob: Blob
  mime: string
  width: number
  height: number
  /** so byte cua anh goc, de bao cho nguoi dung biet da tiet kiem duoc bao nhieu */
  originalBytes: number
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Không nén được ảnh.'))), mime, quality)
  })
}

/**
 * Thu nho va nen mot anh nguoi dung chon.
 *
 * `imageOrientation: 'from-image'` la bat buoc: anh chup doc tren dien thoai
 * duoc luu nam ngang kem co xoay trong EXIF. Ve len canvas ma khong xoay theo
 * thi anh luu lai bi nam nghieng — va vi canvas da bo EXIF nen khong con cach
 * nao sua lai sau do.
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Thiết bị này không vẽ được ảnh.')
    ctx.drawImage(bitmap, 0, 0, width, height)

    const mime = supportsWebP() ? 'image/webp' : 'image/jpeg'
    const blob = await toBlob(canvas, mime, QUALITY)
    return { blob, mime, width, height, originalBytes: file.size }
  } finally {
    bitmap.close()
  }
}

/* ---------------- doc ghi ---------------- */

export async function attachPhoto(transactionId: Id, file: File): Promise<Attachment> {
  const image = await compressImage(file)
  const record: Attachment = {
    id: newId(),
    transactionId,
    blob: image.blob,
    mime: image.mime,
    bytes: image.blob.size,
    width: image.width,
    height: image.height,
    createdAt: Date.now(),
  }
  await db.attachments.add(record)
  return record
}

export function listAttachments(transactionId: Id): Promise<Attachment[]> {
  return db.attachments.where('transactionId').equals(transactionId).toArray()
}

export function deleteAttachment(id: Id): Promise<void> {
  return db.attachments.delete(id)
}

/**
 * Xoa anh cua mot giao dich.
 *
 * Phai goi MOI khi xoa giao dich. Khong goi thi anh o lai mai mai ma khong man
 * hinh nao con mo duoc — chiem cho im lang, dung kieu ro ri hay gap o cac app
 * luu tep kem ban ghi.
 */
export function deleteAttachmentsFor(transactionId: Id): Promise<number> {
  return db.attachments.where('transactionId').equals(transactionId).delete()
}

/* ---------------- don dep ---------------- */

export interface AttachmentUsage {
  count: number
  bytes: number
  /** anh cu nhat, 'YYYY-MM-DD'; rong khi chua co anh nao */
  oldest: string
}

export async function attachmentUsage(): Promise<AttachmentUsage> {
  const rows = await db.attachments.toArray()
  let bytes = 0
  let oldest = Number.POSITIVE_INFINITY
  for (const a of rows) {
    bytes += a.bytes
    if (a.createdAt < oldest) oldest = a.createdAt
  }
  return {
    count: rows.length,
    bytes,
    oldest: rows.length ? new Date(oldest).toISOString().slice(0, 10) : '',
  }
}

/** Xoa anh cu hon `days` ngay. `days <= 0` nghia la giu mai, khong xoa gi. */
export async function purgeOlderThan(days: number): Promise<number> {
  if (!Number.isFinite(days) || days <= 0) return 0
  const cutoff = Date.now() - days * 86_400_000
  return db.attachments.where('createdAt').below(cutoff).delete()
}

/**
 * Xoa anh khong con giao dich nao tro toi.
 *
 * Luoi an toan cho nhung duong xoa giao dich quen goi `deleteAttachmentsFor` —
 * ke ca duong khoi phuc ban sao luu, vi no thay toan bo bang giao dich.
 */
export async function purgeOrphans(): Promise<number> {
  const [attachments, ids] = await Promise.all([
    db.attachments.toArray(),
    db.transactions.toCollection().primaryKeys(),
  ])
  const alive = new Set(ids as Id[])
  const dead = attachments.filter((a) => !alive.has(a.transactionId)).map((a) => a.id)
  if (dead.length) await db.attachments.bulkDelete(dead)
  return dead.length
}

/* ---------------- mang ra ngoai ---------------- */

const EXT: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }

/**
 * Gop toan bo anh thanh mot tep ZIP de nguoi dung tu cat giu.
 *
 * Day la duong DUY NHAT dua anh ra khoi may, va no do nguoi dung tu bam. Ten
 * moi anh la `YYYY-MM-DD__<so tien>__<id giao dich>.webp` de mo ra van doi
 * chieu nguoc lai duoc voi ban sao luu JSON, du hai tep di rieng.
 */
export async function exportAttachments(): Promise<{ blob: Blob; count: number }> {
  const attachments = await db.attachments.orderBy('createdAt').toArray()
  if (attachments.length === 0) return { blob: zipStore([]), count: 0 }

  const txs = await db.transactions.bulkGet(attachments.map((a) => a.transactionId))
  const seen = new Map<string, number>()
  const entries: ZipEntry[] = []

  for (let i = 0; i < attachments.length; i++) {
    const a = attachments[i]
    const tx = txs[i]
    const date = tx?.date ?? new Date(a.createdAt).toISOString().slice(0, 10)
    const amount = tx ? `${tx.kind === 'expense' ? '-' : '+'}${tx.amount}` : 'khong-ro'
    const base = `${date}__${amount}__${a.transactionId.slice(0, 8)}`

    // Mot giao dich co the co nhieu anh; them so thu tu de khong de len nhau
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    const name = `${base}${n > 1 ? `_${n}` : ''}.${EXT[a.mime] ?? 'bin'}`

    entries.push({ name, bytes: new Uint8Array(await a.blob.arrayBuffer()), at: a.createdAt })
  }

  return { blob: zipStore(entries), count: entries.length }
}

/**
 * Don dep luc mo app: bo anh mo coi va anh qua han giu.
 *
 * Chay mot lan moi lan mo, khong co lich rieng — dung luong anh tang cham nen
 * khong can gap, va lam o day thi khong bao gio quen.
 */
export async function runAttachmentHousekeeping(): Promise<{ orphans: number; expired: number }> {
  const orphans = await purgeOrphans()
  const settings = await db.settings.toCollection().first()
  const expired = await purgeOlderThan(settings?.attachmentRetentionDays ?? 0)
  return { orphans, expired }
}
