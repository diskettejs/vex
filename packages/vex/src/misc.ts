import type { Loader } from 'esbuild'
import fs from 'fs/promises'
import path, { dirname, join, relative, resolve } from 'path'
import { ts, type SourceFile } from 'ts-morph'
import type { FileScope, OutputPaths, PackageInfo } from './types.ts'

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

export function getEsBuildLoader(filePath: string): Loader {
  const ext = path.extname(filePath).slice(1)

  switch (ext) {
    case 'js':
      return 'js'
    case 'jsx':
      return 'jsx'
    case 'ts':
      return 'ts'
    case 'tsx':
      return 'tsx'
    case 'mjs':
      return 'js'
    case 'cjs':
      return 'js'
    case 'mts':
      return 'ts'
    case 'cts':
      return 'ts'
    default:
      return 'js'
  }
}

export function findTsConfig(
  args: {
    searchPath?: string
    configName?: string
  } = {},
) {
  const { searchPath = process.cwd(), configName = 'tsconfig.json' } = args

  const tsconfigPath = ts.findConfigFile(
    searchPath,
    ts.sys.fileExists,
    configName,
  )

  if (!tsconfigPath) {
    return
  }

  const tsconfigFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  const { options } = ts.parseJsonConfigFileContent(
    tsconfigFile.config,
    ts.sys,
    path.dirname(tsconfigPath),
  )
  return { compilerOptions: options, tsconfigPath }
}

export function buildVexCompilerOptions(
  outputDir: string,
  compilerOptions?: ts.CompilerOptions,
): ts.CompilerOptions {
  return {
    outDir: outputDir,
    paths: compilerOptions?.paths,
    baseUrl: compilerOptions?.baseUrl,
    moduleResolution: compilerOptions?.moduleResolution,
    rootDir: compilerOptions?.rootDir,
    rootDirs: compilerOptions?.rootDirs,
    strict: compilerOptions?.strict,
    target: compilerOptions?.target,
    lib: compilerOptions?.lib,
    jsx: compilerOptions?.jsx,
    jsxImportSource: compilerOptions?.jsxImportSource,
  }
}
