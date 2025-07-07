import { dirname, relative } from 'node:path'
import invariant from 'tiny-invariant'
import ts from 'typescript'

export function getTsConfig({
  searchPath = process.cwd(),
}: {
  searchPath?: string
  tsconfigPath?: string
} = {}): ts.ParsedCommandLine {
  const configPath = ts.findConfigFile(searchPath, ts.sys.fileExists)

  invariant(configPath, 'Could not find a valid tsconfig')

  return readConfig(configPath)
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
