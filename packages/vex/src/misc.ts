import fs from 'fs/promises'
import path, { dirname, join, relative } from 'path'
import { type SourceFile } from 'ts-morph'
import type { CompileResult, FileScope, OutputPaths } from './types.ts'

export const cssFileFilter: RegExp = /\.css\.(js|cjs|mjs|jsx|ts|tsx)(\?used)?$/
export const tsFileFilter: RegExp = /\.(ts|tsx|mts|cts)$/

export function formatVanillaPaths(path: string): string {
  // If path already matches a .css.{ts,js,...} pattern, return as-is
  if (cssFileFilter.test(path)) {
    return path
  }

  // Normalize trailing slash
  const normalized = path.endsWith('/') ? path.slice(0, -1) : path

  // Append glob pattern for vanilla-extract files
  return `${normalized}/**/*.css.ts`
}

export function looksLikeDirectory(str: string) {
  // Ends with separator, or has no extension
  return str.endsWith('/') || str.endsWith(path.sep) || path.extname(str) === ''
}

export function pathFrom(from: string, to: string) {
  const relativePath = relative(dirname(from), to)
  if (!relativePath.startsWith('../')) {
    return `./${relativePath}`
  }
  return relativePath
}

export function stringifyFileScope({
  packageName,
  filePath,
}: FileScope): string {
  return packageName ? `${filePath}$$$${packageName}` : filePath
}

export function parseFileScope(serialisedFileScope: string): FileScope {
  const [filePath, packageName] = serialisedFileScope.split('$$$')

  return {
    filePath: filePath!,
    packageName,
  }
}

export function invariant(
  condition: unknown,
  message?: string | Error,
): asserts condition {
  if (condition) {
    return
  }

  if (message && typeof message === 'string') {
    throw new Error(message)
  }

  throw message
}

export function getOutputPaths(file: SourceFile): OutputPaths {
  const emit = file.getEmitOutput()
  const outputs = emit.getOutputFiles()

  return outputs.reduce((acc, outputFile) => {
    const filepath = outputFile.getFilePath()

    if (filepath.endsWith('.d.ts')) {
      acc['dts'] = filepath
    } else if (filepath.endsWith('.js')) {
      acc['js'] = filepath
      acc['css'] = join(dirname(filepath), `${file.getBaseName()}.vanilla.css`)
    }
    return acc
  }, {} as OutputPaths)
}

export async function writeOutput(output: {
  code: string
  path: string
}): Promise<void> {
  await fs.mkdir(dirname(output.path), { recursive: true })
  await fs.writeFile(output.path, output.code)
}

const UNITS = ['B', 'kB', 'MB'] as const

export function prettyBytes(bytes: number): string {
  if (bytes < 1) {
    return `${bytes} B`
  }

  const exponent = Math.min(Math.floor(Math.log10(bytes) / 3), UNITS.length - 1)
  const value = bytes / 1000 ** exponent
  const formatted = Number(value.toPrecision(3))

  return `${formatted} ${UNITS[exponent]}`
}

export function prettyMs(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`
  }

  const seconds = ms / 1000
  return `${seconds.toFixed(1)}s`
}

export async function writeResults(result: CompileResult): Promise<void> {
  await Promise.all(Object.values(result.outputs).map(writeOutput))
}
