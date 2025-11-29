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
}

export interface ProcessOptions {
  pkg: PackageInfo
  identifier?: IdentifierOption
}

export interface OutputPaths {
  dts: string
  js: string
  css: string
}

export interface ProcessResult {
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
