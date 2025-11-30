import fs from 'fs/promises'
import { dirname, join, relative, resolve } from 'path'
import type { OutputFile, SourceFile } from 'ts-morph'
import type { FileScope, OutputPaths, PackageInfo } from './types.ts'

// Vite adds a "?used" to CSS files it detects, this isn't relevant for
// .css.ts files but it's added anyway so we need to allow for it in the file match
export const cssFileFilter: RegExp = /\.css\.(js|cjs|mjs|jsx|ts|tsx)(\?used)?$/

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

export function getJsOutputPath(file: SourceFile): string {
  const emit = file.getEmitOutput()
  const outputs = emit.getOutputFiles()
  const jsDist = outputs.find((f) => f.getFilePath().endsWith('.js'))
  invariant(jsDist, `${file.getBaseName()} has not output path`)
  return jsDist.getFilePath()
}

export async function writeOutput(output: {
  code: string
  path: string
}): Promise<void> {
  await fs.mkdir(dirname(output.path), { recursive: true })
  await fs.writeFile(output.path, output.code)
}
