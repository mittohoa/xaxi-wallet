import { useEffect, useState, type ReactNode } from 'react'
import { ReceiptSheet } from './components/ReceiptSheet'
import { ReconcileSheet } from './components/ReconcileSheet'
import { StatementSheet } from './components/StatementSheet'
import { TransactionSheet } from './components/TransactionSheet'
import { TransferSheet } from './components/TransferSheet'
import { seedIfEmpty } from './db/db'
import { migrateLegacyDatabase } from './db/migrate'
import type { CommandName } from './lib/ask'
import { postDueRecurring } from './lib/recurring'
import { requestPersistence } from './lib/storage'
import { GapFiller } from './components/GapFiller'
import { Budgets } from './pages/Budgets'
import { Console } from './pages/Console'
import { Reports } from './pages/Reports'
import { Settings } from './pages/Settings'
import { Transactions } from './pages/Transactions'
import { AppProvider, useApp } from './store'
import type { Transaction } from './types'

/** Van ban duoc chia se vao app (PWA share target / Android send intent) */
function consumeSharedText(): string {
  const params = new URLSearchParams(window.location.search)
  const shared = params.get('text') ?? params.get('shared') ?? ''
  if (shared) {
    // Don sach URL de lan mo sau khong mo lai o dan bien lai
    window.history.replaceState({}, '', window.location.pathname)
  }
  return shared
}

const SHEET_TITLE: Record<Exclude<CommandName, 'help'>, string> = {
  settings: 'Cài đặt',
  budgets: 'Ngân sách',
  reports: 'Báo cáo',
  receipt: 'Dán biên lai',
  reconcile: 'Đối soát số dư',
  statement: 'Nhập sao kê',
  history: 'Lịch sử giao dịch',
  gaps: 'Lấp khoảng trống',
  transfer: 'Chuyển tiền giữa ví',
  newEntry: 'Ghi đầy đủ',
}

/** Tam truot chiem ca man hinh, dung cho cac man hinh phu mo bang lenh */
function FullSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="full-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <header className="full-sheet-top">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng">
          ✕
        </button>
        <h1>{title}</h1>
      </header>
      <div className="full-sheet-body">{children}</div>
    </div>
  )
}

function Shell() {
  const { ready, toast } = useApp()
  const [screen, setScreen] = useState<CommandName | null>(null)
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null)
  const [sharedText, setSharedText] = useState('')

  useEffect(() => {
    const text = consumeSharedText()
    if (text) setSharedText(text)
  }, [])

  useEffect(() => {
    if (!ready) return
    postDueRecurring().then((count) => {
      if (count > 0) toast(`Đã tự ghi ${count} giao dịch định kỳ đến hạn`)
    })
  }, [ready, toast])

  // Nut Back cua Android dong man hinh phu thay vi thoat app
  useEffect(() => {
    if (!screen && !editing) return
    window.history.pushState({ overlay: true }, '')
    const onPop = () => {
      setScreen(null)
      setEditing(null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [screen, editing])

  if (!ready) {
    return (
      <div className="boot">
        <span>Đang mở dữ liệu…</span>
      </div>
    )
  }

  const close = () => setScreen(null)

  return (
    <>
      <Console
        onCommand={(command) => (command === 'newEntry' ? setEditing('new') : setScreen(command))}
        onEditTransaction={setEditing}
      />

      {screen === 'settings' && (
        <FullSheet title={SHEET_TITLE.settings} onClose={close}>
          <Settings />
        </FullSheet>
      )}
      {screen === 'budgets' && (
        <FullSheet title={SHEET_TITLE.budgets} onClose={close}>
          <Budgets />
        </FullSheet>
      )}
      {screen === 'reports' && (
        <FullSheet title={SHEET_TITLE.reports} onClose={close}>
          <Reports />
        </FullSheet>
      )}
      {screen === 'history' && (
        <FullSheet title={SHEET_TITLE.history} onClose={close}>
          <Transactions onEdit={setEditing} />
        </FullSheet>
      )}

      {screen === 'gaps' && (
        <FullSheet title={SHEET_TITLE.gaps} onClose={close}>
          <GapFiller />
        </FullSheet>
      )}

      {screen === 'transfer' && <TransferSheet onClose={close} />}
      {screen === 'receipt' && <ReceiptSheet onClose={close} />}
      {screen === 'reconcile' && <ReconcileSheet onClose={close} />}
      {screen === 'statement' && <StatementSheet onClose={close} />}

      {editing && <TransactionSheet editing={editing} onClose={() => setEditing(null)} />}
      {sharedText && <ReceiptSheet initialText={sharedText} onClose={() => setSharedText('')} />}
    </>
  )
}

export default function App() {
  const [seeded, setSeeded] = useState(false)

  useEffect(() => {
    // Xin bao ve du lieu khoi bi he thong don — lam som nhat co the
    requestPersistence()
    // Di tru tu ban cu (khoa so tu tang) truoc khi tao du lieu mac dinh,
    // khong thi seed se chen vao CSDL rong va bo di tru se bo qua du lieu cu
    migrateLegacyDatabase()
      .catch(() => undefined)
      .then(() => seedIfEmpty())
      .then(() => setSeeded(true))
  }, [])

  if (!seeded) return null

  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
