import { useEffect, useState } from 'react'
import { formatDateLong } from '../lib/date'
import { nativeDateAvailable, pickNativeDate } from '../lib/native/shell'
import { Icon } from './Icon'

/**
 * O chon ngay.
 *
 * Tren Android goi bo chon cua he dieu hanh — lich thang quen thuoc, vuot
 * chuyen thang duoc. Tren web giu nguyen <input type="date">, vi do la thu
 * tot nhat trinh duyet co.
 *
 * Khong co bo chon native thi tu rot ve ban web, nen khong bao gio ke bi mac.
 */
export function DateField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (date: string) => void
}) {
  const [native, setNative] = useState(false)

  useEffect(() => {
    setNative(nativeDateAvailable())
  }, [])

  if (!native) {
    return (
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <input id={id} className="input" type="date" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    )
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <button
        id={id}
        type="button"
        className="input date-button"
        onClick={async () => {
          const picked = await pickNativeDate(value)
          if (picked) onChange(picked)
        }}
      >
        <span>{formatDateLong(value)}</span>
        <span className="date-icon" aria-hidden="true">
          <Icon name="calendar" />
        </span>
      </button>
    </div>
  )
}
