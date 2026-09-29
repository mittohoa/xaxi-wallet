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
