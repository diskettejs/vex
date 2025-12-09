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
  sources?: string | string[]
  identifier?: IdentifierOption
  compilerOptions?: ts.CompilerOptions
}

export interface OutputPaths {
  dts: string
  js: string
  css: string
}

export interface FileMapping {
  source: string
  output: string
}

export interface TransformResult {
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

export interface FileErrorEvent extends FileInfo {
  error: Error
}

export interface BuildFileStartEvent {
  type: 'start'
  file: FileInfo
}

export interface BuildFileCompleteEvent {
  type: 'complete'
  file: FileInfo
  result: TransformResult
  duration: number
}

export interface BuildCompleteEvent {
  type: 'done'
  results: TransformResult[]
  errors: FileErrorEvent[]
  totalDuration: number
}

export interface TranspileInfo {
  path: string
  index: number
  total: number
}

export interface BuildTranspileEvent {
  type: 'transpile'
  file: TranspileInfo
}

export type BuildEvent =
  | BuildTranspileEvent
  | BuildFileStartEvent
  | BuildFileCompleteEvent
  | BuildCompleteEvent

export interface PackageInfo {
  name: string
  dirname: string
  path: string
  version?: string
  description?: string
}
