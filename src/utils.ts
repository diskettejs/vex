import { dirname } from 'node:path'
import invariant from 'tiny-invariant'
import ts from 'typescript'

export function getTsConfig({
  searchPath = process.cwd(),
  configName,
}: {
  searchPath?: string
  configName?: string
} = {}): ts.ParsedCommandLine {
  const tsconfigPath = ts.findConfigFile(
    searchPath,
    ts.sys.fileExists,
    configName,
  )

  invariant(tsconfigPath, 'Could not find a valid tsconfig')
  const tsconfigFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)

  const parsedTsconfig = ts.parseJsonConfigFileContent(
    tsconfigFile.config,
    ts.sys,
    dirname(tsconfigPath),
    undefined,
    tsconfigPath,
  )

  return parsedTsconfig
}

/** From https://github.com/sindresorhus/is/blob/main/source/index.ts#L653 */
export function isPlainObject<Value = unknown>(
  value: unknown,
): value is Record<PropertyKey, Value> {
  // From: https://github.com/sindresorhus/is-plain-obj/blob/main/index.js
  if (typeof value !== 'object' || value === null) {
    return false
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const prototype = Object.getPrototypeOf(value)

  return (
    (prototype === null ||
      prototype === Object.prototype ||
      Object.getPrototypeOf(prototype) === null) &&
    !(Symbol.toStringTag in value) &&
    !(Symbol.iterator in value)
  )
}
