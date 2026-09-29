import { useMemo, useState } from 'react'
import { transferBetweenWallets } from '../lib/actions'
import { todayISO } from '../lib/date'
import { formatMoney, parseAmount } from '../lib/format'
import { walletBalances } from '../lib/stats'
import { useApp } from '../store'
import type { Id } from '../types'
import { Sheet } from './ui'
import { DateField } from './DateField'
import { haptic } from '../lib/native/shell'

/**
 * Chuyen tien giua hai vi.
 *
 * Vi sao phai co man hinh rieng thay vi ghi hai khoan thu/chi: neu ghi tay
 * thanh mot khoan chi va mot khoan thu thi tong chi va tong thu cua thang do
 * deu phong len dung bang so tien vua chuyen, du khong tieu dong nao. Man hinh
 * nay ghi thanh cap ban ghi lien ket de moi phep tinh biet ma loai ra.
 */
export function TransferSheet({ onClose }: { onClose: () => void }) {
  const { wallets, transactions, categories, toast } = useApp()
  const active = useMemo(() => wallets.filter((w) => !w.archived), [wallets])

  const [fromId, setFromId] = useState<Id | null>(active[0]?.id ?? null)
  const [toId, setToId] = useState<Id | null>(active[1]?.id ?? active[0]?.id ?? null)
  const [amountText, setAmountText] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const balances = useMemo(() => walletBalances(wallets, transactions), [wallets, transactions])
  const amount = parseAmount(amountText)
  const valid = Number.isFinite(amount) && amount > 0 && fromId !== null && toId !== null && fromId !== toId

  const fromBalance = fromId ? (balances.get(fromId) ?? 0) : 0
  const vuotSoDu = valid && amount > fromBalance

  async function submit() {
    if (!valid || fromId === null || toId === null) return
    setBusy(true)
    setError(null)
    try {
      await transferBetweenWallets(
        { fromWalletId: fromId, toWalletId: toId, amount, date, note: note.trim() || undefined },
        categories,
      )
      const from = wallets.find((w) => w.id === fromId)
      const to = wallets.find((w) => w.id === toId)
      haptic('heavy')
      toast(`Đã chuyển ${formatMoney(Math.round(amount))} · ${from?.name} → ${to?.name}`)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không chuyển được.')
    } finally {
      setBusy(false)
    }
  }

  function swap() {
    setFromId(toId)
    setToId(fromId)
  }

  return (
    <Sheet title="Chuyển tiền giữa ví" onClose={onClose}>
      <p className="hint" style={{ marginTop: 0, marginBottom: 16 }}>
        Chuyển tiền không phải khoản chi cũng không phải khoản thu — số dư từng ví đổi, nhưng tổng chi tiêu trong tháng
        giữ nguyên.
      </p>

      <div className="transfer-row">
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="tf-from">Từ ví</label>
          <select id="tf-from" className="input" value={fromId ?? ''} onChange={(e) => setFromId(e.target.value)}>
            {active.map((w) => (
              <option key={w.id} value={w.id}>
                {w.icon} {w.name}
              </option>
            ))}
          </select>
          <div className="hint">còn {formatMoney(fromBalance)}</div>
        </div>

        <button type="button" className="icon-btn transfer-swap" onClick={swap} aria-label="Đổi chiều">
          ⇅
        </button>

        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="tf-to">Sang ví</label>
          <select id="tf-to" className="input" value={toId ?? ''} onChange={(e) => setToId(e.target.value)}>
            {active.map((w) => (
              <option key={w.id} value={w.id}>
                {w.icon} {w.name}
              </option>
            ))}
          </select>
          <div className="hint">còn {formatMoney(toId ? (balances.get(toId) ?? 0) : 0)}</div>
        </div>
      </div>

      {fromId === toId && <div className="error" style={{ marginTop: 10 }}>Chọn hai ví khác nhau.</div>}

      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="tf-amount">Số tiền</label>
        <input
          id="tf-amount"
          className="input amount-input"
          inputMode="decimal"
          autoFocus
          placeholder="0"
          value={amountText}
          onChange={(e) => {
            setAmountText(e.target.value)
            setError(null)
          }}
        />
        <div className="hint" style={{ textAlign: 'right' }}>
          {Number.isFinite(amount) && amount > 0 ? formatMoney(Math.round(amount)) : 'Gõ tắt được: 2tr · 500k'}
        </div>
      </div>

      {vuotSoDu && (
        <div className="hint" style={{ color: 'var(--warning)', marginBottom: 12 }}>
          Số tiền lớn hơn số dư ví nguồn — vẫn ghi được, ví sẽ âm.
        </div>
      )}

      <div className="grid-2">
        <DateField id="tf-date" label="Ngày" value={date} onChange={setDate} />
        <div className="field">
          <label htmlFor="tf-note">Ghi chú</label>
          <input
            id="tf-note"
            className="input"
            placeholder="Rút tiền mặt"
            maxLength={140}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onClose}>
          Huỷ
        </button>
        <button type="button" className="btn primary" onClick={submit} disabled={!valid || busy}>
          Chuyển
        </button>
      </div>
    </Sheet>
  )
}
