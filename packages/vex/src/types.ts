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

export interface VexOptions {
  /** Namespace for CSS scoping (used by vanilla-extract to prevent class name collisions) */
  namespace: string
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

export interface FileInfo {
  path: string
  index: number
  total: number
}

export interface FileStartEvent extends FileInfo {}

export interface FileCompleteEvent extends FileInfo {
  result: ProcessResult
  duration: number
}

export interface FileErrorEvent extends FileInfo {
  error: Error
}

export interface ProcessCallbacks {
  onFileStart?: (event: FileStartEvent) => void
  onFileComplete?: (event: FileCompleteEvent) => void | Promise<void>
  onError?: (event: FileErrorEvent) => void
}

export interface ProcessFilesOptions extends ProcessCallbacks {
  /** If true, stop processing on first error. Default: false */
  failFast?: boolean
}

export interface ProcessFilesResult {
  results: ProcessResult[]
  errors: FileErrorEvent[]
  totalDuration: number
}

export interface PackageInfo {
  name: string
  dirname: string
  path: string
  version?: string
  description?: string
}
