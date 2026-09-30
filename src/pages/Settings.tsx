import { useEffect, useRef, useState } from 'react'
import { RecurringSheet } from '../components/RecurringSheet'
import { StatementSheet } from '../components/StatementSheet'
import { ConfirmButton, Empty, Segmented } from '../components/ui'
import { db, stamp, touch, wipeAll } from '../db/db'
import { buildBackup, downloadBlob, downloadFile, readTextFile, restoreBackup, toCSV } from '../lib/backup'
import { MAX_DIMENSION, attachmentUsage, exportAttachments, purgeOlderThan, type AttachmentUsage } from '../lib/attachments'
import { loadDemoData, primeOpeningBalances } from '../lib/demo'
import { formatDate, todayISO } from '../lib/date'
import { formatMoney, parseAmount } from '../lib/format'
import { formatBytes, readStorageStatus, requestPersistence, type StorageStatus } from '../lib/storage'
import { nativeShareAvailable } from '../lib/native/shell'
import { nextCategoryColor } from '../lib/palette'
import { applySyncFile, buildSyncFile, syncFileName } from '../lib/sync/apply'
import { saveSettings, useApp } from '../store'
import type { Id, Recurring, Settings as SettingsType, TxKind, WalletKind } from '../types'
import { Icon } from '../components/Icon'

const FREQ_LABEL: Record<Recurring['freq'], string> = {
  daily: 'Hàng ngày',
  weekly: 'Hàng tuần',
  monthly: 'Hàng tháng',
}

const WALLET_KINDS: { value: WalletKind; label: string; icon: string }[] = [
  { value: 'cash', label: 'Tiền mặt', icon: '👛' },
  { value: 'bank', label: 'Ngân hàng', icon: '🏦' },
  { value: 'ewallet', label: 'Ví điện tử', icon: '📱' },
  { value: 'credit', label: 'Thẻ tín dụng', icon: '💳' },
  { value: 'saving', label: 'Tiết kiệm', icon: '🏆' },
]


export function Settings() {
  const { settings, wallets, categories, transactions, recurring, toast } = useApp()
  const [sheet, setSheet] = useState<'statement' | null>(null)
  const [editingRule, setEditingRule] = useState<Recurring | 'new' | null>(null)
  const [armedWipe, setArmedWipe] = useState(false)
  const [armedDemo, setArmedDemo] = useState(false)
  const restoreInput = useRef<HTMLInputElement>(null)

  const [storage, setStorage] = useState<StorageStatus | null>(null)
  const [asking, setAsking] = useState(false)
  const [photos, setPhotos] = useState<AttachmentUsage | null>(null)
  const [armedPhotos, setArmedPhotos] = useState(false)

  /* Đồng bộ — cụm mật khẩu CHỦ Ý không lưu ở đâu, gõ lại mỗi lần */
  const syncInput = useRef<HTMLInputElement>(null)
  const [cumMatKhau, setCumMatKhau] = useState('')
  const [dangDongBo, setDangDongBo] = useState(false)

  const refreshStorage = () => readStorageStatus().then(setStorage)
  const refreshPhotos = () => attachmentUsage().then(setPhotos)
  useEffect(() => {
    refreshStorage()
    refreshPhotos()
  }, [])

  const [newWallet, setNewWallet] = useState({ name: '', kind: 'cash' as WalletKind, opening: '' })
  const [newCategory, setNewCategory] = useState({ name: '', kind: 'expense' as TxKind, icon: '🏷️' })

  async function patch(next: Partial<SettingsType>) {
    await saveSettings(next)
  }

  /**
   * Bao ket qua SAU khi tep that su ra khoi app, khong phai truoc.
   *
   * Truoc day toast chay ngay sau loi goi tai ve, nen tren Android — noi loi
   * goi do khong tao ra tep nao — app van bao "da xuat ban sao luu". Loi im
   * lang nang nhat tung co trong app nay.
   */
  async function xuat(run: () => Promise<void>, xong: string) {
    try {
      await run()
      toast(nativeShareAvailable() ? 'Chọn nơi lưu tệp' : xong)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Không xuất được tệp')
    }
  }

  async function exportJSON() {
    const backup = await buildBackup()
    await xuat(
      () => downloadFile(`xaxi-backup-${todayISO()}.json`, JSON.stringify(backup, null, 2), 'application/json'),
      'Đã xuất bản sao lưu',
    )
  }

  async function exportCSV() {
    await xuat(
      () => downloadFile(`xaxi-giao-dich-${todayISO()}.csv`, toCSV(transactions, categories, wallets), 'text/csv'),
      'Đã xuất CSV',
    )
  }

  async function exportPhotos() {
    const { blob, count } = await exportAttachments()
    if (count === 0) return toast('Chưa có ảnh nào để xuất')
    await xuat(() => downloadBlob(`xaxi-anh-bien-lai-${todayISO()}.zip`, blob), `Đã xuất ${count} ảnh`)
  }

  async function importJSON(file: File | undefined) {
    if (!file) return
    try {
      const text = await readTextFile(file)
      await restoreBackup(JSON.parse(text))
      toast('Đã khôi phục dữ liệu')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Không khôi phục được')
    } finally {
      if (restoreInput.current) restoreInput.current.value = ''
    }
  }

  /**
   * Bật đồng bộ = xuất một bản sao lưu thường trước đã.
   *
   * Tệp đồng bộ mã hoá bằng cụm mật khẩu; quên nó là mất sạch, không ai khôi
   * phục được. Bản JSON thường là đường lui duy nhất, nên nó phải có TRƯỚC —
   * §3.6 gọi đây là điều bắt buộc.
   */
  async function batDongBo() {
    const backup = await buildBackup()
    await xuat(
      () => downloadFile(`xaxi-backup-${todayISO()}.json`, JSON.stringify(backup, null, 2), 'application/json'),
      'Đã xuất bản sao lưu',
    )
    await saveSettings({ syncReadyAt: Date.now() })
  }

  async function xuatDongBo() {
    if (cumMatKhau.length < 8) return toast('Cụm mật khẩu cần ít nhất 8 ký tự')
    setDangDongBo(true)
    try {
      const envelope = await buildSyncFile(cumMatKhau)
      await xuat(
        () => downloadFile(syncFileName(), JSON.stringify(envelope), 'application/octet-stream'),
        'Đã xuất tệp đồng bộ',
      )
      await saveSettings({ lastSyncAt: Date.now() })
    } finally {
      setDangDongBo(false)
    }
  }

  async function nhapDongBo(file: File | undefined) {
    if (!file) return
    if (!cumMatKhau) return toast('Nhập cụm mật khẩu trước đã')
    setDangDongBo(true)
    try {
      const envelope = JSON.parse(await readTextFile(file))
      const r = await applySyncFile(envelope, cumMatKhau)
      const phan = [
        r.added > 0 && `${r.added} bản ghi mới`,
        r.updated > 0 && `${r.updated} bản cập nhật`,
        r.collapsed > 0 && `${r.collapsed} bản trùng đã gộp`,
      ].filter(Boolean)
      await saveSettings({ lastSyncAt: Date.now() })
      toast(phan.length > 0 ? `Đã hợp nhất · ${phan.join(' · ')}` : 'Không có gì mới — hai máy đã giống nhau')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Không đọc được tệp đồng bộ')
    } finally {
      setDangDongBo(false)
      if (syncInput.current) syncInput.current.value = ''
    }
  }

  async function addWallet() {
    const name = newWallet.name.trim()
    if (!name) return
    const preset = WALLET_KINDS.find((k) => k.value === newWallet.kind)!
    const opening = parseAmount(newWallet.opening)
    await db.wallets.add(
      stamp({
        name,
        kind: newWallet.kind,
        icon: preset.icon,
        color: nextCategoryColor(wallets.length),
        openingBalance: Number.isFinite(opening) ? Math.round(opening) : 0,
      }),
    )
    setNewWallet({ name: '', kind: 'cash', opening: '' })
    toast('Đã thêm ví')
  }

  async function addCategory() {
    const name = newCategory.name.trim()
    if (!name) return
    await db.categories.add(
      stamp({
        name,
        kind: newCategory.kind,
        icon: newCategory.icon || '🏷️',
        color: nextCategoryColor(categories.length),
      }),
    )
    setNewCategory({ name: '', kind: newCategory.kind, icon: '🏷️' })
    toast('Đã thêm danh mục')
  }

  async function removeCategory(id: Id) {
    const used = transactions.some((t) => t.categoryId === id)
    if (used) return toast('Danh mục đang có giao dịch — không thể xoá')
    await db.categories.delete(id)
    toast('Đã xoá danh mục')
  }

  return (
    <>
      <div className="card">
        <div className="card-title">Giao diện</div>
        <Segmented
          wide
          value={settings.theme}
          onChange={(theme) => patch({ theme })}
          options={[
            { value: 'system', label: 'Theo hệ thống' },
            { value: 'light', label: 'Sáng' },
            { value: 'dark', label: 'Tối' },
          ]}
        />
      </div>

      <div className="card">
        <div className="card-title">Thói quen ghi chép</div>
        <div className="hint" style={{ marginBottom: 12 }}>
          App được thiết kế để vẫn cho số liệu đúng khi bạn bận. Các mốc dưới đây quyết định khi nào app chủ động nhắc.
        </div>

        <div className="field">
          <label htmlFor="set-gap">Cửa sổ lấp khoảng trống</label>
          <select
            id="set-gap"
            className="input"
            value={settings.gapWindowDays}
            onChange={(e) => patch({ gapWindowDays: Number(e.target.value) })}
          >
            {[7, 14, 30, 60].map((d) => (
              <option key={d} value={d}>
                {d} ngày gần nhất
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="set-nudge">Chỉ nhắc khi đã trống liên tiếp</label>
          <select
            id="set-nudge"
            className="input"
            value={settings.nudgeAfterGapDays}
            onChange={(e) => patch({ nudgeAfterGapDays: Number(e.target.value) })}
          >
            <option value={0}>Không nhắc</option>
            {[2, 3, 5, 7].map((d) => (
              <option key={d} value={d}>
                {d} ngày trở lên
              </option>
            ))}
          </select>
          <div className="hint">Nhắc mỗi ngày dễ gây nhờn, nên mặc định chỉ nhắc khi thật sự bỏ bê.</div>
        </div>

        <div className="field">
          <label htmlFor="set-recon">Nhắc đối soát số dư mỗi</label>
          <select
            id="set-recon"
            className="input"
            value={settings.reconcileEveryDays}
            onChange={(e) => patch({ reconcileEveryDays: Number(e.target.value) })}
          >
            <option value={0}>Không nhắc</option>
            {[3, 7, 14, 30].map((d) => (
              <option key={d} value={d}>
                {d} ngày
              </option>
            ))}
          </select>
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="set-start">Ngày bắt đầu kỳ trong tháng</label>
          <select
            id="set-start"
            className="input"
            value={settings.startDayOfMonth}
            onChange={(e) => patch({ startDayOfMonth: Number(e.target.value) })}
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                Ngày {d}
              </option>
            ))}
          </select>
          <div className="hint">Đặt trùng ngày nhận lương nếu bạn tính chi tiêu theo kỳ lương.</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          Khoản định kỳ
          <span className="spacer" />
          <button type="button" className="btn sm" onClick={() => setEditingRule('new')}>
            <Icon name="plus" /> Thêm
          </button>
        </div>
        <div className="hint" style={{ marginBottom: 10 }}>
          Tiền nhà, internet, lương… app tự ghi khi tới ngày, bạn không phải nhớ.
        </div>
        {recurring.length === 0 ? (
          <Empty icon="repeat" title="Chưa có khoản định kỳ nào" hint="Mỗi khoản thêm vào là một việc bớt phải nhớ." />
        ) : (
          recurring.map((r) => (
            <button key={r.id} type="button" className="row" onClick={() => setEditingRule(r)}>
              <span className="avatar" style={{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)' }}>
                <Icon name="repeat" />
              </span>
              <span className="body">
                <span className="name">{r.name}</span>
                <span className="meta">
                  {FREQ_LABEL[r.freq]} · lần tới {formatDate(r.nextDate)}
                  {!r.active && ' · đang tạm dừng'}
                </span>
              </span>
              <span className={`trail amount ${r.kind}`}>
                {r.kind === 'expense' ? '−' : '+'}
                {formatMoney(r.amount)}
              </span>
            </button>
          ))
        )}
      </div>

      <div className="card">
        <div className="card-title">Ví / tài khoản</div>
        {wallets.map((w) => (
          <div key={w.id} className="row" style={{ cursor: 'default' }}>
            <span className="avatar" style={{ background: `color-mix(in srgb, ${w.color} 18%, transparent)` }}>
              {w.icon}
            </span>
            <span className="body">
              <span className="name">{w.name}</span>
              <span className="meta">Số dư ban đầu {formatMoney(w.openingBalance)}</span>
            </span>
            <button
              type="button"
              className="btn ghost sm"
              onClick={async () => {
                await db.wallets.update(w.id, { ...touch(), archived: !w.archived })
                toast(w.archived ? 'Đã mở lại ví' : 'Đã ẩn ví')
              }}
            >
              {w.archived ? 'Mở lại' : 'Ẩn'}
            </button>
          </div>
        ))}
        <div className="add-row">
          <input
            className="input"
            placeholder="Tên ví mới"
            value={newWallet.name}
            onChange={(e) => setNewWallet((s) => ({ ...s, name: e.target.value }))}
            aria-label="Tên ví mới"
          />
          <select
            className="input"
            value={newWallet.kind}
            onChange={(e) => setNewWallet((s) => ({ ...s, kind: e.target.value as WalletKind }))}
            aria-label="Loại ví"
          >
            {WALLET_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.icon} {k.label}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Số dư đầu"
            inputMode="decimal"
            value={newWallet.opening}
            onChange={(e) => setNewWallet((s) => ({ ...s, opening: e.target.value }))}
            aria-label="Số dư ban đầu"
          />
          <button type="button" className="btn" onClick={addWallet} disabled={!newWallet.name.trim()}>
            Thêm
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Danh mục</div>
        {(['expense', 'income'] as TxKind[]).map((kind) => (
          <div key={kind} style={{ marginBottom: 14 }}>
            <div className="hint" style={{ marginBottom: 6 }}>{kind === 'expense' ? 'Khoản chi' : 'Khoản thu'}</div>
            <div className="chips">
              {categories
                .filter((c) => c.kind === kind)
                .map((c) => (
                  <span key={c.id} className="chip" style={{ cursor: 'default' }}>
                    <span aria-hidden="true">{c.icon}</span>
                    <span>{c.name}</span>
                    {!c.builtin && (
                      <button
                        type="button"
                        className="chip-x"
                        onClick={() => removeCategory(c.id)}
                        aria-label={`Xoá danh mục ${c.name}`}
                      >
                        <Icon name="close" />
                      </button>
                    )}
                  </span>
                ))}
            </div>
          </div>
        ))}
        <div className="add-row">
          <input
            className="input"
            style={{ maxWidth: 70, textAlign: 'center' }}
            value={newCategory.icon}
            onChange={(e) => setNewCategory((s) => ({ ...s, icon: e.target.value.slice(0, 2) }))}
            aria-label="Biểu tượng danh mục"
          />
          <input
            className="input"
            placeholder="Tên danh mục mới"
            value={newCategory.name}
            onChange={(e) => setNewCategory((s) => ({ ...s, name: e.target.value }))}
            aria-label="Tên danh mục mới"
          />
          <select
            className="input"
            value={newCategory.kind}
            onChange={(e) => setNewCategory((s) => ({ ...s, kind: e.target.value as TxKind }))}
            aria-label="Loại danh mục"
          >
            <option value="expense">Chi</option>
            <option value="income">Thu</option>
          </select>
          <button type="button" className="btn" onClick={addCategory} disabled={!newCategory.name.trim()}>
            Thêm
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Lưu trữ trên máy</div>
        {storage === null ? (
          <div className="hint">Đang đọc…</div>
        ) : (
          <>
            {storage.protection === 'app-private' && (
              <div className="store-state ok">
                <b>Dữ liệu nằm trong vùng riêng của ứng dụng</b>
                <div className="hint" style={{ marginTop: 4 }}>
                  Hệ thống dọn dung lượng chỉ xoá bộ nhớ đệm, không đụng tới đây. Dữ liệu chỉ mất khi bạn gỡ app hoặc
                  bấm "Xoá dữ liệu" trong cài đặt máy.
                </div>
              </div>
            )}

            {storage.protection === 'persisted' && (
              <div className="store-state ok">
                <b>Trình duyệt đã cam kết giữ dữ liệu</b>
                <div className="hint" style={{ marginTop: 4 }}>
                  Sẽ không bị xoá khi máy thiếu dung lượng.
                </div>
              </div>
            )}

            {storage.protection === 'best-effort' && (
              <div className="store-state warn">
                <b>Dữ liệu chưa được trình duyệt cam kết giữ</b>
                <div className="hint" style={{ marginTop: 4 }}>
                  Khi máy gần hết dung lượng, trình duyệt được phép xoá dữ liệu của XAXI mà không báo trước. Thêm XAXI
                  vào màn hình chính sẽ giúp được cấp.
                </div>
              </div>
            )}

            {storage.protection === 'unknown' && (
              <div className="hint">Thiết bị này không cho biết tình trạng lưu trữ.</div>
            )}

            {storage.quotaBytes > 0 && (
              <>
                <div className="meter" style={{ marginTop: 14 }}>
                  <i
                    style={{
                      width: `${Math.max(Math.min((storage.usageBytes / storage.quotaBytes) * 100, 100), 0.5)}%`,
                      background: 'var(--accent)',
                    }}
                  />
                </div>
                <div className="hint" style={{ marginTop: 6 }}>
                  Đang dùng <b>{formatBytes(storage.usageBytes)}</b> trên {formatBytes(storage.quotaBytes)} máy cho phép
                </div>
              </>
            )}

            {storage.canRequest && (
              <button
                type="button"
                className="btn sm primary"
                style={{ marginTop: 14 }}
                disabled={asking}
                onClick={async () => {
                  setAsking(true)
                  const granted = await requestPersistence()
                  await refreshStorage()
                  setAsking(false)
                  toast(
                    granted
                      ? 'Đã bật bảo vệ dữ liệu'
                      : 'Trình duyệt chưa cấp. Thêm XAXI vào màn hình chính rồi thử lại.',
                  )
                }}
              >
                {asking ? 'Đang xin…' : 'Xin trình duyệt giữ dữ liệu'}
              </button>
            )}

            <div className="hint" style={{ marginTop: 12 }}>
              Dù ở mức nào, gỡ app vẫn xoá sạch. Hãy xuất bản sao lưu định kỳ.
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title">Ảnh biên lai</div>
        <div className="hint" style={{ marginBottom: 12 }}>
          Ảnh <b>không bao giờ rời khỏi máy này</b>: không vào bản sao lưu, không lên mạng, không đồng bộ. Mỗi ảnh được
          thu nhỏ còn {MAX_DIMENSION}px và nén lại — thường khoảng 10KB thay vì 3–5MB của ảnh gốc. Toạ độ GPS và thông tin
          máy ảnh trong ảnh gốc bị loại bỏ khi nén.
        </div>

        {photos && photos.count === 0 ? (
          <div className="hint">Chưa lưu ảnh nào. Đính ảnh ngay trong màn hình sửa giao dịch.</div>
        ) : (
          photos && (
            <div className="hint" style={{ marginBottom: 12 }}>
              Đang giữ <b>{photos.count} ảnh</b> · {formatBytes(photos.bytes)} · cũ nhất từ {formatDate(photos.oldest)}
            </div>
          )
        )}

        <div className="field">
          <label htmlFor="set-keep">Tự xoá ảnh cũ hơn</label>
          <select
            id="set-keep"
            className="input"
            value={settings.attachmentRetentionDays ?? 0}
            onChange={async (e) => {
              const days = Number(e.target.value)
              await patch({ attachmentRetentionDays: days })
              const removed = await purgeOlderThan(days)
              await refreshPhotos()
              if (removed) toast(`Đã xoá ${removed} ảnh quá hạn`)
            }}
          >
            <option value={0}>Giữ mãi</option>
            {[90, 180, 365, 730].map((d) => (
              <option key={d} value={d}>
                {d} ngày
              </option>
            ))}
          </select>
          <div className="hint">
            Hoá đơn cũ hiếm khi cần tra lại, nhưng vẫn chiếm chỗ. Đặt mốc ở đây thì app tự dọn mỗi lần mở.
          </div>
        </div>

        <div className="btn-row">
          <button type="button" className="btn" onClick={exportPhotos} disabled={!photos?.count}>
            <Icon name="archive" /> Xuất ảnh ra tệp ZIP
          </button>
          <ConfirmButton
            label="Xoá toàn bộ ảnh"
            confirmLabel="Chắc chắn xoá hết ảnh?"
            armed={armedPhotos}
            setArmed={setArmedPhotos}
            onConfirm={async () => {
              await db.attachments.clear()
              await refreshPhotos()
              await refreshStorage()
              toast('Đã xoá toàn bộ ảnh biên lai')
            }}
          />
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          Ảnh nằm ngoài bản sao lưu JSON nên đổi máy thì phải xuất ZIP riêng. Xoá ảnh không đụng tới giao dịch.
        </div>
      </div>
      <div className="card">
        <div className="card-title">Dữ liệu</div>
        <div className="hint" style={{ marginBottom: 12 }}>
          Dữ liệu nằm trong máy bạn (IndexedDB). Không có tài khoản, không đồng bộ lên máy chủ. Muốn chuyển sang thiết bị
          khác thì xuất bản sao lưu rồi nhập lại. Bản sao lưu <b>không kèm ảnh biên lai</b> — ảnh xuất riêng ở thẻ trên.
        </div>
        <div className="btn-row">
          <button type="button" className="btn" onClick={exportJSON}>
            <Icon name="download" /> Xuất bản sao lưu (JSON)
          </button>
          <button type="button" className="btn" onClick={() => restoreInput.current?.click()}>
            <Icon name="upload" /> Khôi phục từ JSON
          </button>
          <button type="button" className="btn" onClick={exportCSV}>
            <Icon name="file" /> Xuất CSV (Excel)
          </button>
          <button type="button" className="btn" onClick={() => setSheet('statement')}>
            <Icon name="bank" /> Nhập sao kê CSV
          </button>
        </div>
        <input
          ref={restoreInput}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={(e) => importJSON(e.target.files?.[0])}
        />
        <div className="btn-row" style={{ marginTop: 16 }}>
          <ConfirmButton
            label="Nạp dữ liệu mẫu"
            confirmLabel="Ghi đè giao dịch hiện có?"
            className="btn"
            armed={armedDemo}
            setArmed={setArmedDemo}
            onConfirm={async () => {
              await primeOpeningBalances(wallets)
              const summary = await loadDemoData()
              toast(`Đã nạp ${summary.transactions} giao dịch mẫu của 3 tháng`)
            }}
          />
          <ConfirmButton
            label="Xoá toàn bộ dữ liệu"
            confirmLabel="Chắc chắn xoá hết?"
            armed={armedWipe}
            setArmed={setArmedWipe}
            onConfirm={async () => {
              await wipeAll()
              toast('Đã xoá toàn bộ dữ liệu')
            }}
          />
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          Dữ liệu mẫu ghi đè toàn bộ giao dịch, ngân sách và khoản định kỳ hiện có, nhưng giữ nguyên danh mục và ví của bạn.
        </div>
      </div>

      <div className="card">
        <div className="card-title">Đồng bộ đa thiết bị</div>
        <div className="hint" style={{ marginBottom: 12 }}>
          Không có máy chủ và không có tài khoản. App mã hoá toàn bộ dữ liệu thành một tệp, bạn tự mang tệp đó sang máy
          kia — Drive, USB, tự gửi cho chính mình, tuỳ bạn. Ai cầm được tệp cũng chỉ thấy một khối byte vô nghĩa, vì
          khoá sinh từ cụm mật khẩu của bạn và không bao giờ rời khỏi máy.
        </div>

        {/*
          Cảnh báo này KHÔNG được làm nhẹ đi. Mã hoá đầu-cuối nghĩa là không có
          cửa sau — người viết app cũng không mở được tệp của bạn.
        */}
        <div className="nudge danger" style={{ marginBottom: 12 }}>
          <b>Quên cụm mật khẩu là mất sạch tệp đó.</b> Không có cách khôi phục, kể cả người làm ra app. Hãy giữ nó như
          giữ chìa khoá nhà.
        </div>

        {!settings.syncReadyAt ? (
          <>
            <button type="button" className="btn primary" onClick={batDongBo}>
              <Icon name="download" /> Xuất bản sao lưu rồi bật
            </button>
            <div className="hint" style={{ marginTop: 8 }}>
              Bản sao lưu JSON thường không cần mật khẩu, nên nó là đường lui nếu bạn quên cụm mật khẩu sau này. Phải có
              nó trước đã.
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="sync-pass">Cụm mật khẩu</label>
              <input
                id="sync-pass"
                className="input"
                type="password"
                autoComplete="off"
                placeholder="ít nhất 8 ký tự"
                value={cumMatKhau}
                onChange={(e) => setCumMatKhau(e.target.value)}
              />
              <div className="hint">
                Không được lưu lại — gõ lại mỗi lần đồng bộ. Máy kia nhập đúng cụm này là đọc được, không cần đăng nhập
                gì.
              </div>
            </div>

            <div className="btn-row">
              <button type="button" className="btn" onClick={xuatDongBo} disabled={dangDongBo || cumMatKhau.length < 8}>
                <Icon name="upload" /> Xuất tệp đồng bộ
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => syncInput.current?.click()}
                disabled={dangDongBo || cumMatKhau.length < 8}
              >
                <Icon name="download" /> Nhập tệp từ máy khác
              </button>
            </div>
            {/*
              KHÔNG lọc theo kiểu tệp — cố ý.

              Android dựng bộ chọn tệp theo MIME chứ không theo đuôi. Đuôi
              `.xaxi` không có MIME nào, nên `accept=".xaxi"` bị bỏ qua hoàn
              toàn và tệp hiện ra trong danh sách nhưng BỊ LÀM MỜ, không chọn
              được. Người dùng không nhập nổi chính tệp app vừa xuất ra.

              Chọn nhầm tệp khác thì đã có thông báo rõ ràng đỡ — một bộ lọc
              giấu mất tệp duy nhất mà tính năng này sinh ra thì tệ hơn hẳn.
            */}
            <input ref={syncInput} type="file" hidden onChange={(e) => nhapDongBo(e.target.files?.[0])} />

            <div className="hint" style={{ marginTop: 10 }}>
              Nhập là <b>hợp nhất</b>, không phải ghi đè: bản nào mới hơn thắng, khoản đã xoá ở máy này không mọc lại từ
              máy kia, và hai danh mục cùng tên do hai máy tự tạo được gộp làm một.
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title">Quyền riêng tư</div>
        <ul className="privacy-list">
          <li>Không đọc SMS, không nghe thông báo hệ thống, không dùng Accessibility Service.</li>
          <li>Không kết nối tới ngân hàng, không hỏi tài khoản / mật khẩu ngân hàng.</li>
          <li>Biên lai và sao kê chỉ được xử lý ngay trên máy, do bạn chủ động dán hoặc chọn tệp.</li>
          <li>Ảnh biên lai nằm ngoài bản sao lưu và ngoài mọi đường đồng bộ — muốn mang đi phải tự xuất ZIP.</li>
          <li>Không tài khoản, không quảng cáo, không thống kê hành vi.</li>
        </ul>
      </div>

      <p className="footnote">XAXI · phiên bản 1.0 · hoạt động offline</p>

      {sheet === 'statement' && <StatementSheet onClose={() => setSheet(null)} />}
      {editingRule && <RecurringSheet editing={editingRule} onClose={() => setEditingRule(null)} />}
    </>
  )
}
