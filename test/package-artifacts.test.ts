import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

test('build artifacts exist for publish payload', () => {
  const requiredArtifacts = ['dist/index.mjs', 'dist/index.cjs', 'dist/index.d.ts']

  for (const artifact of requiredArtifacts) {
    assert.equal(existsSync(artifact), true, `${artifact} must exist.`)
  }
})

test('dist entrypoints are consumable via ESM and CJS', async () => {
  const esmEntry = pathToFileURL(resolve('dist/index.mjs')).href
  const cjsEntry = resolve('dist/index.cjs')

  const esmExports = await import(esmEntry)
  assert.equal(typeof esmExports.renderTexStatement, 'function')
  assert.equal('TexStatementPreview' in esmExports, false)

  const require = createRequire(import.meta.url)
  const cjsExports = require(cjsEntry) as { renderTexStatement?: unknown; TexStatementPreview?: unknown }
  assert.equal(typeof cjsExports.renderTexStatement, 'function')
  assert.equal('TexStatementPreview' in cjsExports, false)
})

test('npm pack dry-run includes runtime artifacts only', () => {
  const localNpmCache = resolve('.npm-cache')
  mkdirSync(localNpmCache, { recursive: true })

  const raw = execSync('npm pack --dry-run --json', {
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: localNpmCache,
    },
  })

  const parsed = JSON.parse(raw) as Array<{ files: Array<{ path: string }> }>
  assert.equal(Array.isArray(parsed), true)
  assert.equal(parsed.length > 0, true)

  const files = parsed[0].files.map((entry) => entry.path)

  for (const required of ['dist/index.mjs', 'dist/index.cjs', 'dist/index.d.ts', 'README.md', 'LICENSE']) {
    assert.equal(files.includes(required), true, `${required} is missing from npm pack payload.`)
  }

  for (const forbiddenPrefix of ['examples/', 'consumer-app/', 'test/', 'src/']) {
    assert.equal(
      files.some((file) => file.startsWith(forbiddenPrefix)),
      false,
      `npm pack payload must not include ${forbiddenPrefix} files.`,
    )
  }

  assert.equal(files.includes('dist/styles.css'), false)
})
