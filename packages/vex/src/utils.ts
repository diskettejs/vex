import { basename, dirname, isAbsolute, relative } from 'node:path'
import invariant from 'tiny-invariant'
import ts from 'typescript'

const getBasename = (path: string) => {
  return basename(path)
}
export function getTsConfigPath(path = process.cwd()): string {
  const searchPath = isAbsolute(path) ? path : ts.sys.resolvePath(path)

  // If path points to a specific file, check if it exists directly
  if (getBasename(searchPath) && getBasename(searchPath) !== searchPath) {
    if (ts.sys.fileExists(searchPath)) {
      return searchPath
    }
    invariant(false, `Unable to find tsconfig file: ${searchPath}`)
  }

  // Otherwise, search for default tsconfig.json
  const configPath = ts.findConfigFile(
    searchPath,
    ts.sys.fileExists,
    'tsconfig.json',
  )
  invariant(configPath, 'Unable to find a valid tsconfig')

  return configPath
}

export function readConfig(configPath: string): ts.ParsedCommandLine {
  const tsconfigFile = ts.readConfigFile(configPath, ts.sys.readFile)
  return ts.parseJsonConfigFileContent(
    tsconfigFile.config,
    ts.sys,
    dirname(configPath),
    undefined,
    configPath,
  )
}

export function pathFrom(from: string, to: string) {
  const relativePath = relative(dirname(from), to)
  if (!relativePath.startsWith('../')) {
    return `./${relativePath}`
  }
  return relativePath
}
