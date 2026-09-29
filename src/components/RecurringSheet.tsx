import { useState } from 'react'
import { selectableCategories } from '../lib/actions'
import { db, stamp, touch } from '../db/db'
import { firstDueDate } from '../lib/recurring'
import { formatDate } from '../lib/date'
import { formatMoney, parseAmount } from '../lib/format'
import { useApp } from '../store'
import type { Id, Recurring, RecurringFreq, TxKind } from '../types'
import { ConfirmButton, Segmented, Sheet } from './ui'

const WEEKDAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

/**
 * Quy tac sinh giao dich tu dong: tien nha, luong, internet...
 * Nhung khoan biet truoc thi khong nen bat nguoi dung go lai moi thang.
 */
export function RecurringSheet({ editing, onClose }: { editing: Recurring | 'new'; onClose: () => void }) {
  const { categories, wallets, toast } = useApp()
  const initial = editing === 'new' ? null : editing

  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<TxKind>(initial?.kind ?? 'expense')
  const [amountText, setAmountText] = useState(initial ? String(initial.amount) : '')
  const [freq, setFreq] = useState<RecurringFreq>(initial?.freq ?? 'monthly')
  const [anchor, setAnchor] = useState(initial?.anchor ?? new Date().getDate())
  const [categoryId, setCategoryId] = useState<Id | null>(initial?.categoryId ?? null)
  const [walletId, setWalletId] = useState<Id | null>(initial?.walletId ?? null)
  const [armed, setArmed] = useState(false)

  const kindCategories = selectableCategories(categories, kind)
  const activeWallets = wallets.filter((w) => !w.archived)
  const effectiveCategoryId =
    categoryId !== null && kindCategories.some((c) => c.id === categoryId) ? categoryId : (kindCategories[0]?.id ?? null)
  const effectiveWalletId = walletId ?? activeWallets[0]?.id ?? null

  const amount = parseAmount(amountText)
  const valid = Number.isFinite(amount) && amount > 0 && name.trim().length > 0

  const nextDate = initial?.nextDate ?? firstDueDate(freq, anchor)

  async function save() {
    if (!valid || effectiveCategoryId == null || effectiveWalletId == null) return
    const payload = {
      name: name.trim(),
      kind,
      amount: Math.round(amount),
      categoryId: effectiveCategoryId,
      walletId: effectiveWalletId,
      freq,
      anchor,
      active: initial?.active ?? true,
      nextDate: initial ? initial.nextDate : firstDueDate(freq, anchor),
    }
    if (initial?.id) {
      await db.recurring.update(initial.id, { ...payload, ...touch() })
      toast('Đã cập nhật khoản định kỳ')
    } else {
      await db.recurring.add(stamp(payload))
      toast('Đã tạo khoản định kỳ')
    }
    onClose()
  }

  async function remove() {
    if (!initial?.id) return
    await db.recurring.delete(initial.id)
    toast('Đã xoá khoản định kỳ')
    onClose()
  }

  return (
    <Sheet title={initial ? 'Sửa khoản định kỳ' : 'Khoản định kỳ mới'} onClose={onClose}>
      <Segmented
        wide
        value={kind}
        onChange={(k) => {
          setKind(k)
          setCategoryId(null)
        }}
        options={[
          { value: 'expense', label: '− Chi định kỳ', className: 'kind-expense' },
          { value: 'income', label: '+ Thu định kỳ', className: 'kind-income' },
        ]}
      />

      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="rec-name">Tên khoản</label>
        <input
          id="rec-name"
          className="input"
          placeholder="Tiền nhà, Internet, Lương…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>

      <div className="grid-2">
        <div className="field">
          <label htmlFor="rec-amount">Số tiền</label>
          <input
            id="rec-amount"
            className="input"
            inputMode="decimal"
            placeholder="0"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
          />
          {Number.isFinite(amount) && amount > 0 && <div className="hint">{formatMoney(Math.round(amount))}</div>}
        </div>
        <div className="field">
          <label htmlFor="rec-freq">Tần suất</label>
          <select id="rec-freq" className="input" value={freq} onChange={(e) => setFreq(e.target.value as RecurringFreq)}>
            <option value="monthly">Hàng tháng</option>
            <option value="weekly">Hàng tuần</option>
            <option value="daily">Hàng ngày</option>
          </select>
        </div>
      </div>

      {freq === 'monthly' && (
        <div className="field">
          <label htmlFor="rec-day">Ngày trong tháng</label>
          <select id="rec-day" className="input" value={anchor} onChange={(e) => setAnchor(Number(e.target.value))}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                Ngày {d}
              </option>
            ))}
          </select>
          <div className="hint">Tháng ngắn hơn sẽ tự lùi về ngày cuối tháng.</div>
        </div>
      )}

      {freq === 'weekly' && (
        <div className="field">
          <label htmlFor="rec-weekday">Thứ trong tuần</label>
          <select id="rec-weekday" className="input" value={anchor} onChange={(e) => setAnchor(Number(e.target.value))}>
            {WEEKDAYS.map((w, i) => (
              <option key={w} value={i}>
                {w}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid-2">
        <div className="field">
          <label htmlFor="rec-cat">Danh mục</label>
          <select
            id="rec-cat"
            className="input"
            value={effectiveCategoryId ?? ''}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {kindCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="rec-wallet">Ví</label>
          <select
            id="rec-wallet"
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
      </div>

      <div className="hint">Lần ghi kế tiếp: {formatDate(nextDate)} — app sẽ tự ghi khi bạn mở lên.</div>

      <div className="sheet-actions">
        {initial ? (
          <ConfirmButton label="Xoá" confirmLabel="Xác nhận xoá?" onConfirm={remove} armed={armed} setArmed={setArmed} />
        ) : (
          <button type="button" className="btn" onClick={onClose}>
            Huỷ
          </button>
        )}
        <button type="button" className="btn primary" onClick={save} disabled={!valid}>
          Lưu
        </button>
      </div>
    </Sheet>
  )
}
