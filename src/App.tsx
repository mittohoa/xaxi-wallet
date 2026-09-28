import { useEffect, useState } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { ReceiptSheet } from './components/ReceiptSheet'
import { TransactionSheet } from './components/TransactionSheet'
import { seedIfEmpty } from './db/db'
import { postDueRecurring } from './lib/recurring'
import { Budgets } from './pages/Budgets'
import { Dashboard } from './pages/Dashboard'
import { Reports } from './pages/Reports'
import { Settings } from './pages/Settings'
import { Transactions } from './pages/Transactions'
import { AppProvider, useApp } from './store'
import type { Transaction } from './types'

const NAV = [
  { to: '/', label: 'Tổng quan', icon: '🏠', title: 'Tổng quan' },
  { to: '/transactions', label: 'Giao dịch', icon: '🧾', title: 'Giao dịch' },
  { to: '/budgets', label: 'Ngân sách', icon: '🎯', title: 'Ngân sách' },
  { to: '/reports', label: 'Báo cáo', icon: '📊', title: 'Báo cáo' },
  { to: '/settings', label: 'Cài đặt', icon: '⚙️', title: 'Cài đặt' },
]

/** Van ban duoc chia se vao app (PWA share target / Android send intent) */
function consumeSharedText(): string {
  const params = new URLSearchParams(window.location.search)
  const shared = params.get('text') ?? params.get('shared') ?? ''
  if (shared) {
    // Don sach URL de lan mo sau khong mo lai o dan bien lai
    window.history.replaceState({}, '', window.location.pathname + window.location.hash)
  }
  return shared
}

function Shell() {
  const { ready, toast } = useApp()
  const location = useLocation()
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

  const current = NAV.find((n) => n.to === location.pathname) ?? NAV[0]

  return (
    <div className="app">
      <nav className="nav">
        <div className="brand">
          <span aria-hidden="true">💰</span> XAXI
        </div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : undefined)} end={n.to === '/'}>
            <span className="ico" aria-hidden="true">
              {n.icon}
            </span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>

      <div>
        <header className="topbar">
          <h1>{current.title}</h1>
          <span className="spacer" />
        </header>

        <main className="main">
          {!ready ? (
            <div className="card">
              <div className="hint">Đang mở dữ liệu…</div>
            </div>
          ) : (
            <Routes>
              <Route path="/" element={<Dashboard onEdit={setEditing} onNew={() => setEditing('new')} />} />
              <Route path="/transactions" element={<Transactions onEdit={setEditing} />} />
              <Route path="/budgets" element={<Budgets />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          )}
        </main>
      </div>

      <button type="button" className="fab" onClick={() => setEditing('new')} aria-label="Thêm giao dịch">
        ＋
      </button>

      {editing && <TransactionSheet editing={editing} onClose={() => setEditing(null)} />}
      {sharedText && <ReceiptSheet initialText={sharedText} onClose={() => setSharedText('')} />}
    </div>
  )
}

export default function App() {
  const [seeded, setSeeded] = useState(false)

  useEffect(() => {
    seedIfEmpty().then(() => setSeeded(true))
  }, [])

  if (!seeded) return null

  return (
    <AppProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </AppProvider>
  )
}
