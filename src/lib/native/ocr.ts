/**
 * Cau noi toi bo doc chu chay tren may (ML Kit).
 *
 * Anh do app camera cua he thong chup — app nay khong xin quyen camera,
 * khong mo camera, va khong luu anh lai. Anh chi di tu bo nho web xuong
 * plugin native de doc chu roi bi bo di.
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import { type OcrLine, rebuildLayout } from '../receipt-layout'

interface OcrPlugin {
  recognize(options: { image: string }): Promise<{ text: string; lines?: OcrLine[] }>
  recognizeShared(): Promise<{ text: string; lines?: OcrLine[] }>
  isAvailable(): Promise<{ available: boolean }>
}

const Ocr = registerPlugin<OcrPlugin>('Ocr')

/** Chi Android co plugin nay; tren web thi nut chup se khong hien */
export function ocrSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Ocr')
}

/** Anh may anh dien thoai rat lon; thu nho lai truoc khi doc cho do ton bo nho */
const MAX_DIMENSION = 1600

export async function fileToDownscaledDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Không xử lý được ảnh trên thiết bị này.')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  return canvas.toDataURL('image/jpeg', 0.85)
}

export type { OcrLine }

export interface OcrResult {
  text: string
  lines: OcrLine[]
}

export async function recognizeImage(file: File): Promise<OcrResult> {
  if (!ocrSupported()) throw new Error('Thiết bị này chưa hỗ trợ đọc chữ từ ảnh.')
  const image = await fileToDownscaledDataUrl(file)
  const result = await Ocr.recognize({ image })
  const lines = result.lines ?? []
  return {
    // Bo cuc dung lai tu toa do luon dung hon chuoi ML Kit tu ghep; ban cu chi
    // dung khi plugin chua tra ve toa do (ban Android cu hon)
    text: (lines.length > 0 ? rebuildLayout(lines) : result.text) ?? '',
    lines,
  }
}

/** Ten su kien MainActivity ban ra khi nhan duoc anh chia se luc app dang chay */
export const SHARED_IMAGE_EVENT = 'xaxiSharedImage'

/**
 * Doc chu tu anh nguoi dung vua chia se toi app.
 *
 * Anh KHONG di qua day. No duoc doc va nhan dang hoan toan ben Java, va chi
 * doan chu di nguoc len — vai tram byte thay vi vai megabyte base64. Duong kia
 * (dua anh sang JavaScript roi gui nguoc xuong) phai ma hoa hai luot cho mot
 * tam anh chup man hinh co 2 MB.
 *
 * Tra ve chuoi rong nghia la khong co anh nao dang cho.
 */
export async function consumeSharedImageText(): Promise<string> {
  if (!ocrSupported()) return ''
  try {
    const result = await Ocr.recognizeShared()
    const lines = result?.lines ?? []
    return ((lines.length > 0 ? rebuildLayout(lines) : result?.text) ?? '').trim()
  } catch {
    return ''
  }
}
