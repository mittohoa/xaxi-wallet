import { db } from '../db/db'
import type { Recurring } from '../types'
import { toISO, todayISO } from './date'

/** Ngay ke tiep sau `iso` theo tan suat cua quy tac */
export function advance(rule: Recurring, iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (rule.freq === 'daily') {
    const next = new Date(y, m - 1, d + 1)
    return toISO(next)
  }
  if (rule.freq === 'weekly') {
    const next = new Date(y, m - 1, d + 7)
    return toISO(next)
  }
  // monthly: giu dung `anchor`, lui ve ngay cuoi thang neu thang do ngan hon
  const targetMonth = m // 0-based cua thang ke tiep chinh la m
  const lastDay = new Date(y, targetMonth + 1, 0).getDate()
  const day = Math.min(rule.anchor || d, lastDay)
  return toISO(new Date(y, targetMonth, day))
}

/**
 * Sinh cac giao dich dinh ky da den han (tinh den hom nay).
 * Goi khi mo app; tra ve so ban ghi da tao.
 */
export async function postDueRecurring(): Promise<number> {
  const today = todayISO()
  const rules = await db.recurring.filter((r) => r.active && r.nextDate <= today).toArray()
  if (rules.length === 0) return 0

  let created = 0
  await db.transaction('rw', db.recurring, db.transactions, async () => {
    for (const rule of rules) {
      let cursor = rule.nextDate
      // Tran an toan: khong sinh qua 400 ban ghi cho mot quy tac bi bo quen lau
      for (let guard = 0; cursor <= today && guard < 400; guard++) {
        await db.transactions.add({
          kind: rule.kind,
          amount: rule.amount,
          categoryId: rule.categoryId,
          walletId: rule.walletId,
          date: cursor,
          note: rule.note || rule.name,
          createdAt: Date.now(),
          source: 'recurring',
          recurringId: rule.id,
        })
        created++
        cursor = advance(rule, cursor)
      }
      await db.recurring.update(rule.id!, { nextDate: cursor })
    }
  })
  return created
}

/** Ngay dau tien den han cho mot quy tac moi tao */
export function firstDueDate(freq: Recurring['freq'], anchor: number): string {
  const now = new Date()
  if (freq === 'daily') return todayISO()
  if (freq === 'weekly') {
    const delta = (anchor - now.getDay() + 7) % 7
    const d = new Date(now)
    d.setDate(d.getDate() + delta)
    return toISO(d)
  }
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const day = Math.min(anchor, lastDay)
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), day)
  if (toISO(thisMonth) >= toISO(now)) return toISO(thisMonth)
  const nextLast = new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate()
  return toISO(new Date(now.getFullYear(), now.getMonth() + 1, Math.min(anchor, nextLast)))
}
