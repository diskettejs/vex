import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import * as url from 'node:url'
import { ts } from 'ts-morph'
import type { PackageInfo } from './types.ts'

const require = createRequire(import.meta.url)

/**
 * get package.json content from startDir
 * @param cwd
 * @returns package.json content
 */
export const getPackageJson = (cwd: string): PackageInfo | undefined => {
  try {
    const startDir = path.dirname(url.fileURLToPath(cwd))
    const packageJsonPath = findPackageJson(startDir)
    if (packageJsonPath) {
      return require(packageJsonPath)
    }
    return undefined
  } catch (error) {
    // ignore error
    return undefined
  }
}

/**
 * search package.json from startDir
 * @param startDir
 * @returns
 */
const findPackageJson = (startDir: string): string => {
  let currentDir = startDir
  while (true) {
    const packageJsonPath = path.join(currentDir, 'package.json')
    if (fs.existsSync(packageJsonPath)) {
      return packageJsonPath
    }

    const parentDir = path.resolve(currentDir, '..')
    if (parentDir === currentDir) {
      return ''
    }

    currentDir = parentDir
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
