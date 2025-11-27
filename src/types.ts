export type CustomIdentFunction = (params: {
  hash: string
  filePath: string
  debugId?: string
  packageName?: string
}) => string
export type IdentifierOption = 'short' | 'debug' | CustomIdentFunction

export interface ProcessResult {
  js: string
  css: string
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
