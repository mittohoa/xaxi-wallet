import assert from 'node:assert/strict'
import test from 'node:test'

import { formatBytes, readStorageStatus, requestPersistence } from '../src/lib/storage'

/** Gán tạm một navigator giả rồi trả lại nguyên trạng */
async function withNavigator<T>(value: unknown, run: () => Promise<T>): Promise<T> {
  const had = 'navigator' in globalThis
  const before = (globalThis as Record<string, unknown>).navigator
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true })
  try {
    return await run()
  } finally {
    if (had) Object.defineProperty(globalThis, 'navigator', { value: before, configurable: true, writable: true })
    else delete (globalThis as Record<string, unknown>).navigator
  }
}

test('formatBytes đọc được ở mọi bậc', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(-5), '0 B')
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatBytes(1024), '1,0 KB')
  assert.equal(formatBytes(45 * 1024), '45 KB')
  assert.equal(formatBytes(1024 * 1024), '1,0 MB')
  assert.equal(formatBytes(16 * 1024 * 1024), '16 MB')
  assert.equal(formatBytes(10 * 1024 * 1024 * 1024), '10 GB')
})

test('máy không hỗ trợ Storage API thì báo không rõ, chứ không vờ như đã an toàn', async () => {
  const status = await withNavigator({}, () => readStorageStatus())
  assert.equal(status.protection, 'unknown')
  assert.equal(status.canRequest, false)
})

test('web đã được cấp thì báo đã cam kết giữ', async () => {
  const status = await withNavigator(
    { storage: { persisted: async () => true, estimate: async () => ({ usage: 46_080, quota: 10_737_418_240 }) } },
    () => readStorageStatus(),
  )
  assert.equal(status.protection, 'persisted')
  assert.equal(status.canRequest, false, 'đã cấp rồi thì không mời xin lại')
  assert.equal(formatBytes(status.usageBytes), '45 KB')
  assert.equal(formatBytes(status.quotaBytes), '10 GB')
})

test('web chưa được cấp thì cảnh báo và mời xin', async () => {
  const status = await withNavigator(
    {
      storage: {
        persisted: async () => false,
        persist: async () => false,
        estimate: async () => ({ usage: 1024, quota: 2048 }),
      },
    },
    () => readStorageStatus(),
  )
  assert.equal(status.protection, 'best-effort')
  assert.equal(status.canRequest, true)
})

test('đã được cấp rồi thì không xin lại', async () => {
  let asked = 0
  const granted = await withNavigator(
    {
      storage: {
        persisted: async () => true,
        persist: async () => {
          asked++
          return true
        },
      },
    },
    () => requestPersistence(),
  )
  assert.equal(granted, true)
  assert.equal(asked, 0, 'đã bảo vệ thì khỏi hỏi lại')
})

test('chưa được cấp thì xin, và trả về đúng kết quả hệ thống cho', async () => {
  for (const answer of [true, false]) {
    const granted = await withNavigator(
      { storage: { persisted: async () => false, persist: async () => answer } },
      () => requestPersistence(),
    )
    assert.equal(granted, answer)
  }
})

test('WebView ném lỗi thì coi như chưa được cấp, không làm sập app', async () => {
  const granted = await withNavigator(
    {
      storage: {
        persisted: async () => false,
        persist: async () => {
          throw new Error('not allowed')
        },
      },
    },
    () => requestPersistence(),
  )
  assert.equal(granted, false)
})
