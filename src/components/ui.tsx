import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { splitMoney } from '../lib/format'

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

export function Empty({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="empty">
      <span className="ico" aria-hidden="true">
        {icon}
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
        // Nen trung tinh + vong mau manh: to mau thang vao nen lam emoji bi duc
        background: 'var(--surface-2)',
        boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${color} 55%, transparent)`,
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
