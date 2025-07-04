import {
  createFSBackedSystem,
  createVirtualCompilerHost,
} from '@typescript/vfs'
import {
  cssFileFilter,
  getPackageInfo,
  transformSync,
  type IdentifierOption,
} from '@vanilla-extract/integration'
import evalCode from 'eval'
import { createRequire, isBuiltin } from 'node:module'
import { basename, dirname, join, resolve } from 'node:path'
import invariant from 'tiny-invariant'
import ts from 'typescript'
import { processVanillaFile } from './process-vanilla-file.ts'
import { getTsConfig } from './utils.ts'

const require = createRequire(import.meta.url)

export interface VanillaOptions {
  identifier?: IdentifierOption
  cssExt?: string
}

export class VanillaVfs {
  #pkg = getPackageInfo()
  #tsConfig: ts.ParsedCommandLine
  #files = new Map<string, string>()
  #vanillaCache = new Map<string, string>()
  #output = new Map<string, string>()
  #system: ts.System
  #host: ts.CompilerHost

  constructor(options?: VanillaOptions, tsConfig?: ts.ParsedCommandLine) {
    this.#tsConfig = tsConfig ?? getTsConfig()

    this.#system = this.#createSystem(options)
    this.#host = createVirtualCompilerHost(
      this.#system,
      this.options,
      ts,
    ).compilerHost

    for (const file of this.fileNames) {
      this.#system.writeFile(file, ts.sys.readFile(file)!)
    }
  }

  /** Map of absolute file paths and their content. */
  get files(): Map<string, string> {
    return this.#files
  }

  /** Compiler options */
  get options(): ts.CompilerOptions {
    return this.#tsConfig.options
  }

  /** vanilla-extract file names */
  get fileNames(): string[] {
    return this.#tsConfig.fileNames.filter((file) => cssFileFilter.test(file))
  }

  compile(compilerOptions: ts.CompilerOptions = this.options) {
    const program = ts.createProgram({
      options: compilerOptions,
      rootNames: this.fileNames,
      host: this.#host,
    })

    program.emit(undefined, (path, data) => {
      this.#output.set(path, data)
    })

    return this.#output
  }

  #createSystem(options?: VanillaOptions): ts.System {
    const system = createFSBackedSystem(this.#files, this.#pkg.dirname, ts)
    system.writeFile = this.#createWriter(system.writeFile, options)
    return system
  }

  #createWriter(
    writeFile: ts.System['writeFile'],
    { identifier = 'short', cssExt }: VanillaOptions = {},
  ): ts.System['writeFile'] {
    return (filePath, text, writeByteOrderMark) => {
      if (!cssFileFilter.test(filePath)) {
        writeFile(filePath, text, writeByteOrderMark)
        return
      }

      const { js, css } = this.compileVanilla(filePath, text, {
        identifier,
        cssExt,
      })
      const outputPath = this.getOutputPath(filePath)
      const cssPath = join(dirname(outputPath!), basename(css.path))
      this.#output.set(cssPath, css.content)

      writeFile(filePath, js, writeByteOrderMark)
    }
  }

  #createVirtualRequire(containingFile: string) {
    return (moduleId: string) => {
      const module = this.resolveModule(moduleId, containingFile)

      if (module?.isExternalLibraryImport || isBuiltin(moduleId)) {
        return require(moduleId)
      }

      if (!module?.resolvedFileName) return
      const filePath = module.resolvedFileName

      const content = this.#system.readFile(filePath)
      invariant(content)

      const js = this.transformVanilla(filePath, content)

      return evalCode(js, filePath, {
        console,
        process,
        require: this.#createVirtualRequire(filePath),
      })
    }
  }

  transformVanilla(
    filePath: string,
    content: string,
    { identifier = 'short' }: { identifier?: IdentifierOption } = {},
  ): string {
    const cached = this.#vanillaCache.get(filePath)
    if (cached) {
      return cached
    }
    const transformed = transformSync({
      filePath,
      identOption: identifier,
      packageName: this.#pkg.name,
      rootPath: this.#pkg.dirname,
      source: content,
    })
    const transpiled = ts.transpile(transformed, this.options)
    this.#vanillaCache.set(filePath, transpiled)

    return transpiled
  }

  compileVanilla(
    filePath: string,
    content: string,
    { identifier = 'short', cssExt }: VanillaOptions = {},
  ) {
    const css = { content: '', path: '' }

    const js = processVanillaFile({
      filePath,
      source: this.transformVanilla(filePath, content),
      identOption: identifier,
      virtualRequire: this.#createVirtualRequire(filePath),
      serializeVirtualCssPath: (file) => {
        const base = basename(file.fileName)
        const fileName = cssExt
          ? base.replace('.css.ts.vanilla.css', cssExt)
          : base
        css.content = file.source
        css.path = resolve(dirname(filePath), fileName)
        return `import './${fileName}';`
      },
    })

    return { js, css }
  }

  resolveModule(
    moduleId: string,
    containingFile: string,
  ): ts.ResolvedModuleFull | undefined {
    return ts.resolveModuleName(
      moduleId,
      containingFile,
      this.options,
      this.#host,
    ).resolvedModule
  }

  getOutputPath(fileName: string) {
    const paths = ts.getOutputFileNames(this.#tsConfig, fileName, false)
    return paths.find((path) => path.endsWith('.js'))
  }
}
