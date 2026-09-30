/** Khai báo kiểu cho version.mjs, để vite.config.ts nạp được mà không mất kiểu */
export interface BuildVersion {
  code: number
  name: string
  sha: string
  full: string
}
export function buildVersion(): BuildVersion
