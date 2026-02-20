import { build } from 'esbuild'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const defaultTests = ['test/renderTexStatement.test.ts']
const requested = process.argv.slice(2)
const testEntries = requested.length > 0 ? requested : defaultTests

const outDir = resolve('.test-build')
await rm(outDir, { recursive: true, force: true })

await build({
  entryPoints: testEntries,
  outdir: outDir,
  outbase: '.',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  sourcemap: false,
  logLevel: 'silent',
})

const compiledTests = testEntries.map((entry) => resolve(outDir, entry).replace(/\.ts$/, '.js'))
const result = spawnSync(process.execPath, ['--test', ...compiledTests], {
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
