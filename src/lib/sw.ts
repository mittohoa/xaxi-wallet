/**
 * Dang ky service worker cho ban web.
 *
 * Mo app khi khong co mang truoc day ra trang trang — khong phai vi du lieu
 * mat, ma vi trinh duyet khong tai duoc chinh doan ma de doc du lieu do. Voi
 * mot app tai chinh chay hoan toan tren may, do la loi nang nhat trong ba loi:
 * du lieu van con nguyen ma nguoi dung tuong da mat sach.
 *
 * Chi chay tren web. Android qua Capacitor da co du tep trong APK; them mot
 * lop cache o do chi tao ra kha nang phuc vu ban cu sau khi cap nhat.
 */
import { Capacitor } from '@capacitor/core'

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return
  if (Capacitor.isNativePlatform()) return
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    // Duong dan tuong doi: app duoc trien khai duoi thu muc con tren GitHub Pages
    navigator.serviceWorker.register('./sw.js').catch(() => undefined)
  })

  /**
   * Ban moi dung `skipWaiting()` nen se gianh quyen dieu khien giua chung. Tai
   * lai mot lan de trang dang mo khong chay lan ma cu voi ma moi.
   *
   * `controller === null` nghia la lan dau cai — luc do khong duoc tai lai, vi
   * trang dang chay chinh la ban vua tai ve.
   */
  let reloading = false
  const fresh = navigator.serviceWorker.controller === null
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (fresh || reloading) return
    reloading = true
    window.location.reload()
  })
}
