import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { splitMoney } from '../lib/format'
import { Icon, type IconName } from './Icon'

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return createPortal(
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  wide,
}: {
  value: T
  options: { value: T; label: string; className?: string }[]
  onChange: (value: T) => void
  wide?: boolean
}) {
  return (
    <div className={wide ? 'segmented wide' : 'segmented'} role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.className}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Con so lon: ky hieu tien te nho va nhat lai, de mat bat vao phan co nghia.
 */
export function Figure({ value }: { value: number }) {
  const { text, symbol } = splitMoney(value)
  return (
    <>
      {text}
      <span className="sym">{symbol}</span>
    </>
  )
}

/** So tien co dau va mau theo loai giao dich */
export function Money({ value, kind, signed }: { value: number; kind?: 'income' | 'expense'; signed?: boolean }) {
  const { text, symbol } = splitMoney(Math.abs(value))
  return (
    <span className={kind ? `amount ${kind}` : 'amount'}>
      {signed && <span className="sign">{kind === 'expense' ? '−' : '+'}</span>}
      {text}
      <span className="sym">{symbol}</span>
    </span>
  )
}

export function Empty({ icon, title, hint }: { icon: IconName; title: string; hint?: string }) {
  return (
    <div className="empty">
      <span className="ico" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{title}</div>
      {hint && <div style={{ marginTop: 4, fontSize: 13 }}>{hint}</div>}
    </div>
  )
}

/** Vong tron co vien mau manh — nhe hon nhieu so voi o vuong to dac */
export function Avatar({ icon, color }: { icon: string; color: string }) {
  return (
    <span
      className="avatar"
      style={{
        // Nen nhuom rat nhat theo mau danh muc, khong to dac: to dac vao thi
        // emoji bi duc va ca cot bieu tuong thanh mot day mang mau chong nhau.
        background: `color-mix(in srgb, ${color} 14%, var(--surface-2))`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 30%, transparent)`,
      }}
      aria-hidden="true"
    >
      {icon}
    </span>
  )
}

export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  className = 'btn danger',
  armed,
  setArmed,
}: {
  label: string
  confirmLabel: string
  onConfirm: () => void
  className?: string
  armed: boolean
  setArmed: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (armed) {
          onConfirm()
          setArmed(false)
        } else {
          setArmed(true)
        }
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  )
}

/**
 * Nhãn so sánh với kỳ trước.
 *
 * Thứ đáng lấy nhất từ bộ giao diện tham khảo: nó thêm rất nhiều thông tin mà
 * KHÔNG đòi người dùng nhập thêm gì.
 *
 * Hai điều bắt buộc:
 * - có mũi tên đi kèm màu, để người loạn sắc không phải dựa vào màu;
 * - `percent` bằng null thì KHÔNG hiện gì. Kỳ trước bằng 0 thì không có gì để
 *   so, và bịa ra "+100%" là nói dối về chính con số của người dùng.
 *
 * `invert` dành cho khoản chi: chi nhiều hơn kỳ trước là tin xấu, nên phải tô
 * màu ngược lại với thu.
 */
/** Dưới mức này thì coi như không đổi — dao động thường ngày, không phải tín hiệu */
const DELTA_DEAD_ZONE = 5

export function Delta({
  percent,
  invert,
  quiet,
}: {
  percent: number | null
  invert?: boolean
  /** không đổi thì im hẳn thay vì hiện "≈ như kỳ trước" — dùng trong danh sách dài */
  quiet?: boolean
}) {
  if (percent === null || !Number.isFinite(percent)) return null

  const rounded = Math.round(percent)
  if (Math.abs(rounded) < DELTA_DEAD_ZONE) {
    return quiet ? null : <span className="delta flat">≈ như kỳ trước</span>
  }

  const tang = rounded > 0
  const tone = tang === !invert ? 'up' : 'down'
  return (
    <span className={`delta ${tone}`}>
      {/* Có nhãn chứ không ẩn: mũi tên này là kênh THỨ HAI thay cho màu, nên
          người dùng trình đọc màn hình cũng phải nghe được chiều tăng hay giảm.
          Ẩn nó đi thì họ chỉ nghe thấy "12%" mà không biết 12% theo hướng nào. */}
      <Icon name={tang ? 'up' : 'down'} label={tang ? 'tăng' : 'giảm'} /> {Math.abs(rounded)}%
    </span>
  )
}

/** Ô số liệu: nhãn nhỏ, con số lớn, và nhãn so sánh nếu có */
export function Tile({
  label,
  value,
  kind,
  delta,
}: {
  label: string
  value: number
  kind: 'up' | 'down'
  delta?: number | null
}) {
  return (
    <div className={`tile ${kind}`}>
      <span className="tile-head">
        <span className={`dot ${kind === 'up' ? 'income' : 'expense'}`} aria-hidden="true" />
        {label}
      </span>
      <span className="tile-value">
        <Money value={value} />
      </span>
      {delta !== undefined && <Delta percent={delta ?? null} invert={kind === 'down'} />}
    </div>
  )
}

/**
 * Màu của một chiều tiền.
 *
 * Tồn tại để không ai ghép tên biến CSS bằng chuỗi nữa. Ba chỗ trong app từng
 * dựng tên biến từ giá trị `kind`; khi token đổi tên từ --income/--expense sang --up/--down
 * thì cả ba gãy cùng lúc mà không grep nào thấy, và cột biểu đồ đổ về màu đen.
 * Đi qua hàm này thì trình biên dịch bắt được.
 */
export function flowColor(kind: 'income' | 'expense'): string {
  return kind === 'income' ? 'var(--up)' : 'var(--down)'
}
