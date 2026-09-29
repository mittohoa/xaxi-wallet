import { useMemo, useRef, useState } from 'react'
import { addTransaction, reconcileWallet, systemCategory } from '../lib/actions'
import { formatDate } from '../lib/date'
import { formatMoney } from '../lib/format'
import { parseReceipt } from '../lib/receipt'
import { walletBalances } from '../lib/stats'
import { useApp } from '../store'
import { Sheet } from './ui'
import type { Id } from '../types'
import { ocrSupported, recognizeImage } from '../lib/native/ocr'

/**
 * Ghi giao dich tu doan van ban bien lai NGUOI DUNG tu dan vao.
 * Khong doc SMS, khong nghe thong bao he thong — chi xu ly cai duoc dan.
 */
export function ReceiptSheet({ initialText = '', onClose }: { initialText?: string; onClose: () => void }) {
  const { categories, wallets, transactions, toast } = useApp()
  const [text, setText] = useState(initialText)
  const [walletId, setWalletId] = useState<Id | null>(wallets.find((w) => !w.archived)?.id ?? null)
  const [categoryId, setCategoryId] = useState<Id | null>(null)
  const [alsoReconcile, setAlsoReconcile] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const canScan = ocrSupported()

  async function scan(file: File | undefined) {
    if (!file) return
    setScanning(true)
    setScanError(null)
    try {
      const result = await recognizeImage(file)
      if (!result.text.trim()) {
        setScanError('Không thấy chữ nào trong ảnh. Thử chụp gần hơn và đủ sáng.')
      } else {
        setText(result.text)
        setCategoryId(null)
      }
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Không đọc được ảnh.')
    } finally {
      setScanning(false)
      if (cameraInput.current) cameraInput.current.value = ''
    }
  }

  const parsed = useMemo(() => parseReceipt(text), [text])
  const balances = useMemo(() => walletBalances(wallets, transactions), [wallets, transactions])

  const kindCategories = categories.filter((c) => c.kind === (parsed?.kind ?? 'expense'))
  const fallback = parsed
    ? systemCategory(categories, parsed.kind === 'income' ? 'uncategorized-income' : 'uncategorized-expense')
    : undefined
  const effectiveCategoryId = categoryId ?? fallback?.id ?? kindCategories[0]?.id ?? null

  async function save() {
    if (!parsed || effectiveCategoryId == null || walletId == null) return
    const wallet = wallets.find((w) => w.id === walletId)
    if (!wallet) return

    await addTransaction({
      kind: parsed.kind,
      amount: parsed.amount,
      categoryId: effectiveCategoryId,
      walletId,
      date: parsed.date,
      note: parsed.note || undefined,
      source: 'quick',
    })

    let extra = ''
    if (alsoReconcile && parsed.balance !== undefined) {
      const computed = (balances.get(walletId) ?? 0) + (parsed.kind === 'income' ? parsed.amount : -parsed.amount)
      const result = await reconcileWallet(wallet, computed, parsed.balance, categories, parsed.date)
      if (result.createdKind) extra = ` · đối soát lệch ${formatMoney(Math.abs(result.difference))}`
    }

    toast(`Đã ghi ${formatMoney(parsed.amount)}${extra}`)
    onClose()
  }

  return (
    <Sheet title="Dán biên lai" onClose={onClose}>
      {canScan && (
        <>
          <div className="scan-row">
            <button
              type="button"
              className="btn"
              onClick={() => cameraInput.current?.click()}
              disabled={scanning}
            >
              📷 {scanning ? 'Đang đọc ảnh…' : 'Chụp biên lai'}
            </button>
            <span className="hint">ảnh được đọc ngay trên máy, không lưu lại, không gửi đi đâu</span>
          </div>
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={(e) => scan(e.target.files?.[0])}
          />
          {scanError && <div className="error" style={{ marginBottom: 10 }}>{scanError}</div>}
        </>
      )}

      <div className="field">
        <label htmlFor="receipt-text">{canScan ? 'Hoặc dán tin nhắn biến động số dư' : 'Dán tin nhắn biến động số dư hoặc thông báo thanh toán'}</label>
        <textarea
          id="receipt-text"
          className="input"
          rows={5}
          autoFocus
          placeholder={'Ví dụ:\nTK 0123456789 -45,000VND luc 12/09/2026. So du: 1,234,567VND. ND: HIGHLANDS COFFEE'}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setCategoryId(null)
          }}
          style={{ resize: 'vertical', minHeight: 110 }}
        />
        <div className="hint">
          Dữ liệu chỉ được xử lý ngay trên máy bạn. Ứng dụng không xin quyền đọc SMS hay thông báo hệ thống.
        </div>
      </div>

      {parsed ? (
        <div className="receipt-preview">
          <div className="receipt-amount">
            <span className={`amount ${parsed.kind}`}>
              {parsed.kind === 'expense' ? '−' : '+'}
              {formatMoney(parsed.amount)}
            </span>
            <span className="hint">{formatDate(parsed.date)}</span>
          </div>
          {parsed.note && <div className="receipt-note">{parsed.note}</div>}
          {parsed.issuer && <div className="hint">Nguồn nhận diện: {parsed.issuer}</div>}

          <div className="grid-2" style={{ marginTop: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="receipt-cat">Danh mục</label>
              <select
                id="receipt-cat"
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
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="receipt-wallet">Ví</label>
              <select
                id="receipt-wallet"
                className="input"
                value={walletId ?? ''}
                onChange={(e) => setWalletId(e.target.value)}
              >
                {wallets
                  .filter((w) => !w.archived)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.icon} {w.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {parsed.balance !== undefined && (
            <label className="check-row" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={alsoReconcile} onChange={(e) => setAlsoReconcile(e.target.checked)} />
              <span>
                Đối soát số dư ví về <b>{formatMoney(parsed.balance)}</b> (đọc được từ tin nhắn)
              </span>
            </label>
          )}
        </div>
      ) : (
        text.trim().length > 0 && <div className="error">Chưa nhận ra số tiền trong đoạn văn bản này.</div>
      )}

      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onClose}>
          Huỷ
        </button>
        <button type="button" className="btn primary" onClick={save} disabled={!parsed}>
          Lưu
        </button>
      </div>
    </Sheet>
  )
}
