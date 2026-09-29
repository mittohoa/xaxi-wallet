import { useMemo, useState } from 'react'
import { selectableCategories } from '../lib/actions'
import { db, newId, stamp, touch } from '../db/db'
import { formatMoney, parseAmount } from '../lib/format'
import { todayISO } from '../lib/date'
import { useApp } from '../store'
import type { Id, Transaction, TxKind } from '../types'
import { ConfirmButton, Segmented, Sheet, flowColor } from './ui'
import { DateField } from './DateField'
import { PhotoStrip } from './PhotoStrip'
import { deleteAttachmentsFor } from '../lib/attachments'

export function TransactionSheet({ editing, onClose }: { editing: Transaction | 'new'; onClose: () => void }) {
  const { categories, wallets, toast } = useApp()
  const initial = editing === 'new' ? null : editing

  const [kind, setKind] = useState<TxKind>(initial?.kind ?? 'expense')
  const [amountText, setAmountText] = useState(initial ? String(initial.amount) : '')
  const [categoryId, setCategoryId] = useState<Id | null>(initial?.categoryId ?? null)
  const [walletId, setWalletId] = useState<Id | null>(initial?.walletId ?? null)
  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [note, setNote] = useState(initial?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [armed, setArmed] = useState(false)

  /**
   * Id duoc sinh TRUOC khi luu.
   *
   * Anh phai dinh vao mot giao dich cu the, nhung nguoi dung thuong chup ngay
   * luc dang nhap chu khong quay lai sau. Sinh id truoc thi dai anh dung duoc
   * tu dau; doi lai, thoat ma khong luu thi phai tu don anh da dinh — dieu
   * `discard()` ben duoi lo.
   */
  const [draftId] = useState<Id>(() => initial?.id ?? newId())

  const activeWallets = useMemo(() => wallets.filter((w) => !w.archived || w.id === initial?.walletId), [wallets, initial])
  const kindCategories = useMemo(() => selectableCategories(categories, kind), [categories, kind])

  const amount = parseAmount(amountText)
  const amountValid = Number.isFinite(amount) && amount > 0

  // Danh muc / vi mac dinh khi chua chon hoac khi doi loai giao dich
  const effectiveCategoryId =
    categoryId !== null && kindCategories.some((c) => c.id === categoryId) ? categoryId : (kindCategories[0]?.id ?? null)
  const effectiveWalletId = walletId ?? activeWallets[0]?.id ?? null

  async function save() {
    if (!amountValid) return setError('Nhập số tiền lớn hơn 0.')
    if (effectiveCategoryId == null) return setError('Chưa có danh mục nào cho loại này.')
    if (effectiveWalletId == null) return setError('Chưa có ví nào. Thêm ví trong Cài đặt.')

    const payload = {
      kind,
      amount: Math.round(amount),
      categoryId: effectiveCategoryId,
      walletId: effectiveWalletId,
      date,
      note: note.trim() || undefined,
    }

    if (initial?.id) {
      await db.transactions.update(initial.id, { ...payload, ...touch() })
      toast('Đã cập nhật giao dịch')
    } else {
      await db.transactions.add(stamp({ ...payload, id: draftId, createdAt: Date.now() }))
      toast(kind === 'expense' ? 'Đã ghi khoản chi' : 'Đã ghi khoản thu')
    }
    onClose()
  }

  /** Thoat ma khong luu: anh da dinh vao ban nhap khong duoc o lai lam rac */
  async function discard() {
    if (!initial) await deleteAttachmentsFor(draftId)
    onClose()
  }

  async function remove() {
    if (!initial?.id) return
    await db.transactions.delete(initial.id)
    await deleteAttachmentsFor(initial.id)
    toast('Đã xoá giao dịch')
    onClose()
  }

  return (
    <Sheet title={initial ? 'Sửa giao dịch' : 'Giao dịch mới'} onClose={discard}>
      <Segmented
        wide
        value={kind}
        onChange={(k) => {
          setKind(k)
          setCategoryId(null)
        }}
        options={[
          { value: 'expense', label: '− Khoản chi', className: 'kind-expense' },
          { value: 'income', label: '+ Khoản thu', className: 'kind-income' },
        ]}
      />

      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="tx-amount">Số tiền</label>
        <input
          id="tx-amount"
          className="input amount-input"
          inputMode="decimal"
          autoFocus
          placeholder="0"
          value={amountText}
          onChange={(e) => {
            setAmountText(e.target.value)
            setError(null)
          }}
          style={{ color: amountValid ? flowColor(kind) : undefined }}
        />
        <div className="hint" style={{ textAlign: 'right' }}>
          {amountValid ? formatMoney(Math.round(amount)) : 'Gõ tắt được: 50k · 1.2tr · 3ty'}
        </div>
      </div>

      <div className="field">
        <label>Danh mục</label>
        <div className="chips">
          {kindCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              className="chip"
              aria-pressed={c.id === effectiveCategoryId}
              style={{ color: c.id === effectiveCategoryId ? c.color : undefined }}
              onClick={() => setCategoryId(c.id)}
            >
              <span aria-hidden="true">{c.icon}</span>
              <span style={{ color: 'var(--text-primary)' }}>{c.name}</span>
            </button>
          ))}
          {kindCategories.length === 0 && <span className="hint">Chưa có danh mục — thêm trong Cài đặt.</span>}
        </div>
      </div>

      <div className="grid-2">
        <div className="field">
          <label htmlFor="tx-wallet">Ví / tài khoản</label>
          <select
            id="tx-wallet"
            className="input"
            value={effectiveWalletId ?? ''}
            onChange={(e) => setWalletId(e.target.value)}
          >
            {activeWallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.icon} {w.name}
              </option>
            ))}
          </select>
        </div>
        <DateField id="tx-date" label="Ngày" value={date} onChange={setDate} />
      </div>

      <div className="field">
        <label htmlFor="tx-note">Ghi chú</label>
        <input
          id="tx-note"
          className="input"
          placeholder="Ví dụ: cà phê với khách hàng"
          value={note}
          maxLength={140}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <PhotoStrip transactionId={draftId} />

      {error && <div className="error">{error}</div>}

      <div className="sheet-actions">
        {initial ? (
          <ConfirmButton label="Xoá" confirmLabel="Xác nhận xoá?" onConfirm={remove} armed={armed} setArmed={setArmed} />
        ) : (
          <button type="button" className="btn" onClick={discard}>
            Huỷ
          </button>
        )}
        <button type="button" className="btn primary" onClick={save} disabled={!amountValid}>
          Lưu
        </button>
      </div>
    </Sheet>
  )
}
