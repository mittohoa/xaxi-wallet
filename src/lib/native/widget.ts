/**
 * Tien ich man hinh chinh.
 *
 * Widget chay trong tien trinh cua launcher va KHONG doc duoc IndexedDB cua
 * WebView — hai lop cach nhau, khong co duong nao. Nen lop web phai GHI SAN mot
 * ban tom tat rat nho ra SharedPreferences moi lan du lieu doi; widget chi doc
 * lai. Mot noi ghi, mot noi doc.
 *
 * Chi gui CHUOI DA DINH DANG. Dinh dang tien te (locale, don vi, dau phan cach)
 * song o lop web; lam lai o lop native la co hai cho cung dinh dang mot thu, va
 * som muon chung se lech nhau o mot truong hop biên.
 */
import { Capacitor, registerPlugin } from '@capacitor/core'

interface WidgetPlugin {
  updateWidget(options: { today: string; month: string; monthLabel: string; hint: string }): Promise<void>
  consumeQuickIntent(): Promise<{ quick: boolean }>
}

const Shell = registerPlugin<WidgetPlugin>('Shell')

function available(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Shell')
}

/** Ten su kien MainActivity ban ra khi nguoi dung bam "Ghi nhanh" luc app dang chay */
export const QUICK_EVENT = 'xaxiQuick'

export interface WidgetSummary {
  /** chi hom nay, da dinh dang */
  today: string
  /** chi ca ky, da dinh dang */
  month: string
  /** nhan ky, vi du 'Tháng 9' */
  monthLabel: string
  /** mot dong canh bao, hoac chuoi rong khi khong co gi dang noi */
  hint: string
}

/**
 * Cap nhat ban tom tat.
 *
 * Tra ve lang le khi khong phai Android — tren web khong co widget de cap nhat,
 * va do khong phai loi.
 */
export function publishWidgetSummary(summary: WidgetSummary): void {
  if (!available()) return
  Shell.updateWidget(summary).catch(() => undefined)
}

/**
 * Nguoi dung vao app tu nut "Ghi nhanh" tren widget hay khong.
 *
 * Lop native xoa co ngay sau khi tra ve, nen goi hai lan chi dung mot lan — dung
 * nhu mong doi: khong the mo ban phim len o moi lan mo app sau do.
 */
export async function consumeQuickIntent(): Promise<boolean> {
  if (!available()) return false
  try {
    const r = await Shell.consumeQuickIntent()
    return Boolean(r?.quick)
  } catch {
    return false
  }
}
