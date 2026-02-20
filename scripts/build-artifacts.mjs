import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { constants } from 'node:fs'

await access(resolve('dist/index.d.ts'), constants.F_OK)
