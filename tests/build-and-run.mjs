// Bien dich cac file test TypeScript roi chay bang node --test.
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'

const outdir = 'tests/.out'
rmSync(outdir, { recursive: true, force: true })

await build({
  entryPoints: ['tests/core.test.ts', 'tests/receipt-paper.test.ts', 'tests/ask.test.ts', 'tests/xlsx.test.ts', 'tests/learn.test.ts', 'tests/numberwords.test.ts', 'tests/storage.test.ts', 'tests/migrate.test.ts', 'tests/tombstone.test.ts', 'tests/sync.test.ts', 'tests/sync-roundtrip.test.ts', 'tests/zip.test.ts', 'tests/tokens.test.ts', 'tests/foresight.test.ts', 'tests/jars.test.ts', 'tests/goals.test.ts', 'tests/order.test.ts', 'tests/mime.test.ts', 'tests/imap.test.ts', 'tests/icons.test.ts', 'tests/charts.test.ts', 'tests/telegram.test.ts', 'tests/attachments.test.ts', 'tests/app.test.tsx'],
  outdir,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['node:*', 'jsdom', 'fake-indexeddb', 'fake-indexeddb/auto'],
  logLevel: 'error',
})

const result = spawnSync(
  process.execPath,
  ['--test', '--test-force-exit', `${outdir}/core.test.js`, `${outdir}/receipt-paper.test.js`, `${outdir}/ask.test.js`, `${outdir}/xlsx.test.js`, `${outdir}/learn.test.js`, `${outdir}/numberwords.test.js`, `${outdir}/storage.test.js`, `${outdir}/migrate.test.js`, `${outdir}/tombstone.test.js`, `${outdir}/sync.test.js`, `${outdir}/sync-roundtrip.test.js`, `${outdir}/zip.test.js`, `${outdir}/tokens.test.js`, `${outdir}/foresight.test.js`, `${outdir}/jars.test.js`, `${outdir}/goals.test.js`, `${outdir}/order.test.js`, `${outdir}/mime.test.js`, `${outdir}/imap.test.js`, `${outdir}/icons.test.js`, `${outdir}/charts.test.js`, `${outdir}/telegram.test.js`, `${outdir}/attachments.test.js`, `${outdir}/app.test.js`],
  { stdio: 'inherit' },
)
process.exit(result.status ?? 1)
