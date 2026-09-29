import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { DEFAULT_SETTINGS, db, stamp, touch } from './db/db'
import { configureFormat } from './lib/format'
import type { Budget, Category, DayMark, Id, Recurring, Settings, Template, Transaction, Wallet } from './types'

export interface AppData {
  categories: Category[]
  wallets: Wallet[]
  transactions: Transaction[]
  budgets: Budget[]
  dayMarks: DayMark[]
  templates: Template[]
  recurring: Recurring[]
  settings: Settings
  /** false cho den khi IndexedDB tra ve lan dau */
  ready: boolean
}

interface Ctx extends AppData {
  toast: (message: string) => void
}

/** Ban thiet lap dung tam khi chua doc duoc tu CSDL */
const FALLBACK_SETTINGS: Settings = { ...DEFAULT_SETTINGS, id: 'pending', updatedAt: 0 }

const AppCtx = createContext<Ctx | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const toast = useCallback((next: string) => {
    setMessage(next)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessage(null), 2800)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const raw = useLiveQuery(async () => {
    const [categories, wallets, transactions, budgets, dayMarks, templates, recurring, settingsRows] = await Promise.all([
      db.categories.toArray(),
      db.wallets.toArray(),
      db.transactions.toArray(),
      db.budgets.toArray(),
      db.dayMarks.toArray(),
      db.templates.toArray(),
      db.recurring.toArray(),
      db.settings.toArray(),
    ])
    return {
      categories,
      wallets,
      transactions,
      budgets,
      dayMarks,
      templates,
      recurring,
      settings: { ...FALLBACK_SETTINGS, ...(settingsRows[0] ?? {}) } as Settings,
    }
  }, [])

  const settings = raw?.settings ?? FALLBACK_SETTINGS

  // Dinh dang tien te phai san sang truoc khi cac trang render so lieu
  configureFormat(settings.locale, settings.currency)

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && media.matches)
      root.classList.toggle('theme-dark', dark)
      root.dataset.theme = dark ? 'dark' : 'light'
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d0d0d' : '#f9f9f7')
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [settings.theme])

  const value = useMemo<Ctx>(
    () => ({
      categories: raw?.categories ?? [],
      wallets: raw?.wallets ?? [],
      transactions: raw?.transactions ?? [],
      budgets: raw?.budgets ?? [],
      dayMarks: raw?.dayMarks ?? [],
      templates: raw?.templates ?? [],
      recurring: raw?.recurring ?? [],
      settings,
      ready: raw !== undefined,
      toast,
    }),
    [raw, settings, toast],
  )

  return (
    <AppCtx.Provider value={value}>
      {children}
      {message && (
        <div className="toast" role="status" aria-live="polite">
          {message}
        </div>
      )}
    </AppCtx.Provider>
  )
}

export function useApp(): Ctx {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useApp phải nằm trong <AppProvider>')
  return ctx
}

/** Tra cuu nhanh danh muc / vi theo id */
export function useLookups() {
  const { categories, wallets } = useApp()
  return useMemo(
    () => ({
      catById: new Map(categories.map((c) => [c.id, c])),
      walletById: new Map(wallets.map((w) => [w.id, w])),
    }),
    [categories, wallets],
  )
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const existing = await db.settings.toArray()
  if (existing.length === 0) await db.settings.add(stamp({ ...DEFAULT_SETTINGS, ...patch }))
  else await db.settings.update(existing[0].id, { ...patch, ...touch() })
}

export type { Transaction, Category, Wallet, Budget, Settings, DayMark, Template, Recurring, Id }
