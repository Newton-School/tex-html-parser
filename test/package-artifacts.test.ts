import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve } from 'node:path'

test('package metadata has expected scoped publish setup', async () => {
  const packageJsonPath = resolve('package.json')
  const packageJsonRaw = await readFile(packageJsonPath, 'utf8')
  const pkg = JSON.parse(packageJsonRaw) as {
    name: string
    scripts?: Record<string, string>
  }

  assert.equal(pkg.name, '@newtonschool/tex-html-parser')
  assert.equal(pkg.scripts?.prepublishOnly, 'npm run build')
})

test('build artifacts required for publishing exist', async () => {
  const requiredArtifacts = ['dist/index.cjs', 'dist/index.mjs', 'dist/index.d.ts']
  await Promise.all(requiredArtifacts.map((file) => access(resolve(file), constants.F_OK)))
})
