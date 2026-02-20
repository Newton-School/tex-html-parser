import { copyFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const distDir = resolve('dist')
await mkdir(distDir, { recursive: true })
await copyFile(resolve('src/index.d.ts'), resolve(distDir, 'index.d.ts'))
