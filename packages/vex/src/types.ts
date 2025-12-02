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

export interface FileErrorEvent extends FileInfo {
  error: Error
}

export interface ProcessStartEvent {
  type: 'start'
  file: FileInfo
}

export interface ProcessCompleteEvent {
  type: 'complete'
  file: FileInfo
  result: ProcessResult
  duration: number
}

export interface ProcessErrorEvent {
  type: 'error'
  file: FileInfo
  error: Error
}

export interface ProcessDoneEvent {
  type: 'done'
  totalDuration: number
}

export type ProcessEvent =
  | ProcessStartEvent
  | ProcessCompleteEvent
  | ProcessErrorEvent
  | ProcessDoneEvent

export interface StreamOptions {
  failFast?: boolean
}

export interface PackageInfo {
  name: string
  dirname: string
  path: string
  version?: string
  description?: string
}
