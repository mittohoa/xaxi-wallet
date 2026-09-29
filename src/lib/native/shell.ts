/**
 * Nhung manh native lam cho lop web bot giong trang web:
 * rung phan hoi va mau thanh he thong theo chu de.
 *
 * Tat ca deu la "co thi tot, khong co van chay" — tren web cac ham nay
 * lang le khong lam gi, khong nem loi.
 */
import { Capacitor, registerPlugin } from '@capacitor/core'

interface ShellPlugin {
  haptic(options: { style: 'light' | 'heavy' }): Promise<void>
  applyTheme(options: { dark: boolean; background: string }): Promise<{ applied: boolean }>
  pickDate(options: { date: string }): Promise<{ date?: string; cancelled: boolean }>
  consumeSharedText(): Promise<{ text: string }>
  setOverlayOpen(options: { open: boolean }): Promise<void>
}

const Shell = registerPlugin<ShellPlugin>('Shell')

function available(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Shell')
}

/** Rung nhe sau mot thao tac thanh cong — dung cho moi lan ghi duoc mot khoan */
export function haptic(style: 'light' | 'heavy' = 'light'): void {
  if (!available()) return
  Shell.haptic({ style }).catch(() => undefined)
}

/** Dong bo mau thanh trang thai va thanh dieu huong voi chu de cua app */
export function applySystemTheme(dark: boolean, background: string): void {
  if (!available()) return
  Shell.applyTheme({ dark, background }).catch(() => undefined)
}

interface DatePickResult {
  date?: string
  cancelled: boolean
}

/**
 * Mo bo chon ngay cua he dieu hanh.
 * Tra ve null khi nguoi dung bo qua, hoac khi may khong ho tro (lop web se
 * tu rot ve <input type="date">).
 */
export async function pickNativeDate(current: string): Promise<string | null> {
  if (!available()) return null
  try {
    const result = (await (Shell as unknown as {
      pickDate(o: { date: string }): Promise<DatePickResult>
    }).pickDate({ date: current })) as DatePickResult
    return result.cancelled || !result.date ? null : result.date
  } catch {
    return null
  }
}

/** Co dung duoc bo chon ngay native khong */
export function nativeDateAvailable(): boolean {
  return available()
}

/** Ten su kien MainActivity ban ra khi app dang chay ma nhan duoc van ban chia se */
export const SHARED_TEXT_EVENT = 'xaxiSharedText'

/**
 * Lay van ban nguoi dung vua chia se toi app (menu Chia se cua Android).
 *
 * Phien ban truoc doc tu `?text=` tren URL — dung voi PWA share target tren
 * web, nhung tren Android thi Capacitor khong bao gio dien tham so do, nen
 * doan tin nhan bien dong so du bi vut mat im lang. Tren native phai hoi
 * thang lop native.
 */
export async function consumeNativeSharedText(): Promise<string> {
  if (!available()) return ''
  try {
    const result = await Shell.consumeSharedText()
    return result?.text?.trim() ?? ''
  } catch {
    return ''
  }
}

/** Ten su kien MainActivity ban ra khi nguoi dung bam nut Back cua Android */
export const BACK_EVENT = 'xaxiBack'

/** Nut Back co duoc lop native chuyen toi day khong */
export function nativeBackAvailable(): boolean {
  return available()
}

/**
 * Bao cho lop native biet dang co tam truot chiem man hinh.
 *
 * Can thiet vi loi Capacitor 6 khong dong toi nut Back — khong co no thi Back
 * dong thang app du dang mo Cai dat hay bieu mau nao. Nhung cung khong duoc
 * nuot moi lan bam Back, khong thi khong thoat app duoc nua; vi vay native can
 * biet CHINH XAC luc nao co thu de dong.
 */
export function setNativeOverlayOpen(open: boolean): void {
  if (!available()) return
  Shell.setOverlayOpen({ open }).catch(() => undefined)
}
