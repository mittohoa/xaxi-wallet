let currency = 'VND'
let locale = 'vi-VN'

export function configureFormat(nextLocale: string, nextCurrency: string) {
  locale = nextLocale
  currency = nextCurrency
}

const cache = new Map<string, Intl.NumberFormat>()
function nf(key: string, opts: Intl.NumberFormatOptions) {
  const id = `${locale}|${currency}|${key}`
  let f = cache.get(id)
  if (!f) {
    f = new Intl.NumberFormat(locale, opts)
    cache.set(id, f)
  }
  return f
}

/** VND khong co phan le; ngoai te giu 2 so le */
function fractionDigits() {
  return currency === 'VND' ? 0 : 2
}

export function formatMoney(value: number): string {
  return nf('cur', {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits(),
    maximumFractionDigits: fractionDigits(),
  }).format(value)
}

export function formatNumber(value: number): string {
  return nf('num', { maximumFractionDigits: fractionDigits() }).format(value)
}

/** Rut gon cho truc bieu do: 1.2tr, 850k */
export function formatCompact(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (currency === 'VND') {
    if (abs >= 1_000_000_000) return `${sign}${trim(abs / 1_000_000_000)}tỷ`
    if (abs >= 1_000_000) return `${sign}${trim(abs / 1_000_000)}tr`
    if (abs >= 1_000) return `${sign}${trim(abs / 1_000)}k`
    return `${sign}${Math.round(abs)}`
  }
  return nf('compact', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function trim(n: number): string {
  return (Math.round(n * 10) / 10).toString()
}

/** Doc so tien nguoi dung go: "1.200.000", "1200k", "1,2tr" */
export function parseAmount(input: string): number {
  const raw = input.trim().toLowerCase().replace(/\s/g, '')
  if (!raw) return NaN
  const m = raw.match(/^([\d.,]+)(k|tr|trieu|triệu|ty|tỷ|m|b)?$/)
  if (!m) return NaN
  let [, digits, unit] = m
  // Bo dau phan cach nghin, giu dau phan cach thap phan cuoi cung neu co
  const lastComma = digits.lastIndexOf(',')
  const lastDot = digits.lastIndexOf('.')
  const sepIdx = Math.max(lastComma, lastDot)
  let n: number
  if (sepIdx >= 0 && digits.length - sepIdx - 1 <= 2 && unit) {
    n = Number(digits.slice(0, sepIdx).replace(/[.,]/g, '') + '.' + digits.slice(sepIdx + 1))
  } else {
    n = Number(digits.replace(/[.,]/g, ''))
  }
  if (!Number.isFinite(n)) return NaN
  switch (unit) {
    case 'k': return n * 1_000
    case 'tr': case 'trieu': case 'triệu': case 'm': return n * 1_000_000
    case 'ty': case 'tỷ': case 'b': return n * 1_000_000_000
    default: return n
  }
}
