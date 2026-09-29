import { useEffect, useRef, useState } from 'react'
import { attachPhoto, deleteAttachment, listAttachments } from '../lib/attachments'
import { formatBytes } from '../lib/storage'
import type { Attachment, Id } from '../types'
import { haptic } from '../lib/native/shell'

/**
 * Dai anh bien lai cua mot giao dich.
 *
 * Anh o day chi de NGUOI DUNG doi chieu lai sau — "35k nay la cai gi?" — chu
 * khong phai du lieu app dung de tinh toan. Vi vay no nam duoi cung bieu mau,
 * khong chen vao luong nhap, va khong co anh thi khong chiem cho.
 *
 * Moi anh duoc ve bang mot object URL; phai thu hoi khi go khoi man hinh, khong
 * thi blob nam lai trong bo nho suot phien.
 */
export function PhotoStrip({ transactionId }: { transactionId: Id }) {
  const [items, setItems] = useState<Attachment[]>([])
  const [urls, setUrls] = useState<Map<Id, string>>(new Map())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState<Id | null>(null)
  const picker = useRef<HTMLInputElement>(null)

  async function reload() {
    setItems(await listAttachments(transactionId))
  }

  useEffect(() => {
    reload()
  }, [transactionId])

  // Object URL song theo danh sach anh, khong theo vong doi cua component
  useEffect(() => {
    const next = new Map<Id, string>()
    for (const a of items) next.set(a.id, URL.createObjectURL(a.blob))
    setUrls(next)
    return () => {
      for (const url of next.values()) URL.revokeObjectURL(url)
    }
  }, [items])

  async function add(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      await attachPhoto(transactionId, file)
      haptic('light')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được ảnh.')
    } finally {
      setBusy(false)
      if (picker.current) picker.current.value = ''
    }
  }

  async function remove(id: Id) {
    await deleteAttachment(id)
    setZoom(null)
    await reload()
  }

  const total = items.reduce((n, a) => n + a.bytes, 0)

  return (
    <div className="field photo-strip">
      <label>
        Ảnh biên lai
        {items.length > 0 && <span className="hint"> · {items.length} ảnh, {formatBytes(total)}</span>}
      </label>

      <div className="photo-row">
        {items.map((a) => (
          <button
            key={a.id}
            type="button"
            className="photo-thumb"
            onClick={() => setZoom(a.id)}
            aria-label={`Xem ảnh ${formatBytes(a.bytes)}`}
          >
            <img src={urls.get(a.id)} alt="" loading="lazy" />
          </button>
        ))}

        <button type="button" className="photo-add" onClick={() => picker.current?.click()} disabled={busy}>
          {busy ? '…' : '＋'}
          <span>{busy ? 'Đang nén' : 'Thêm ảnh'}</span>
        </button>
      </div>

      <input
        ref={picker}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => add(e.target.files?.[0])}
      />

      {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}

      <div className="hint">
        Ảnh được nén ngay trên máy và <b>chỉ nằm trên máy này</b> — không vào bản sao lưu, không lên mạng. Dữ liệu vị trí
        trong ảnh gốc bị loại bỏ.
      </div>

      {zoom && (
        <div className="photo-zoom" onClick={() => setZoom(null)} role="presentation">
          <img src={urls.get(zoom)} alt="Ảnh biên lai" />
          <div className="photo-zoom-actions" onClick={(e) => e.stopPropagation()} role="presentation">
            <button type="button" className="btn" onClick={() => setZoom(null)}>
              Đóng
            </button>
            <button type="button" className="btn danger" onClick={() => remove(zoom)}>
              Xoá ảnh
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
