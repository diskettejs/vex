import type { ts } from 'ts-morph'

export type CustomIdentFunction = (params: {
  hash: string
  filePath: string
  debugId?: string
  packageName?: string
}) => string
export type IdentifierOption = 'short' | 'debug' | CustomIdentFunction

export type FileScope = {
  packageName?: string | undefined
  filePath: string
}

export interface PackageInfo {
  name: string
  path: string
  dirname: string
  version?: string
  description?: string
}

export interface NexOptions {
  tsconfig?: string
  pkgInfo: PackageInfo
  identifier?: IdentifierOption
  compilerOptions?: ts.CompilerOptions
}

export interface OutputPaths {
  dts: string
  js: string
  css: string
}

export interface ProcessResult {
  source: string
  outputs: {
    js: {
      code: string
      path: string
    }
    css: {
      code: string
      path: string
    }
    dts: {
      code: string
      path: string
    }
  }
}
