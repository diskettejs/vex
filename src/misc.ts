import fs from 'fs/promises'
import { dirname, relative, resolve } from 'path'
import type { PackageInfo } from './types.ts'

// Vite adds a "?used" to CSS files it detects, this isn't relevant for
// .css.ts files but it's added anyway so we need to allow for it in the file match
export const cssFileFilter: RegExp = /\.css\.(js|cjs|mjs|jsx|ts|tsx)(\?used)?$/
export const virtualCssFileFilter: RegExp = /\.vanilla\.css\?source=.*$/

export async function pkgInfo(path = './package.json'): Promise<PackageInfo> {
  const packageJsonExists = await fs.access(path).then(
    () => true,
    () => false,
  )

  if (!packageJsonExists) {
    throw new Error(`${path} does not exist`)
  }

  const resolved = resolve(path)
  const packageJsonString = await fs.readFile(resolved, 'utf8')
  const packageJson = JSON.parse(packageJsonString)

  return { dirname: dirname(resolved), path: resolved, ...packageJson }
}

export function pathFrom(from: string, to: string) {
  const relativePath = relative(dirname(from), to)
  if (!relativePath.startsWith('../')) {
    return `./${relativePath}`
  }
  return relativePath
}
