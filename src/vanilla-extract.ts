import {
  createFSBackedSystem,
  createVirtualCompilerHost,
} from '@typescript/vfs'
import type { Adapter } from '@vanilla-extract/css'
import { transformCss } from '@vanilla-extract/css/transformCss'
import {
  cssFileFilter,
  getPackageInfo,
  serializeVanillaModule,
  transformSync,
  type IdentifierOption,
} from '@vanilla-extract/integration'
import evalCode from 'eval'
import { createRequire, isBuiltin } from 'node:module'
import { join, parse } from 'node:path'
import invariant from 'tiny-invariant'
import ts from 'typescript'
import { getTsConfig, pathFrom } from './utils.ts'

export type Css = Parameters<Adapter['appendCss']>[0]
export type Composition = Parameters<Adapter['registerComposition']>[0]

/** See https://github.com/vanilla-extract-css/vanilla-extract/blob/master/packages/integration/src/processVanillaFile.ts#L110 */
const originalNodeEnv = process.env.NODE_ENV

export interface VanillaOptions {
  identifier?: IdentifierOption
  cssExt?: string
  imports?: boolean
}

export class VanillaExtract {
  #pkg = getPackageInfo()
  #tsConfig: ts.ParsedCommandLine
  #files = new Map<string, string>()
  #transformCache = new Map<string, string>()
  #system: ts.System
  #host: ts.CompilerHost
  #vanillaOptions: VanillaOptions

  #cssScopes = new Map<string, { css: Css[]; imports: Set<string> }>()
  #localClassNames = new Set<string>()
  #composedClassLists: Composition[] = []
  #usedCompositions = new Set<string>()
  #require: NodeJS.Require

  constructor(options: VanillaOptions = {}, tsConfig?: ts.ParsedCommandLine) {
    this.#vanillaOptions = { imports: true, ...options }
    this.#tsConfig = tsConfig ?? getTsConfig()
    this.#require = createRequire(this.#pkg.path)
    this.#system = this.#createSystem()
    this.#host = createVirtualCompilerHost(
      this.#system,
      this.options,
      ts,
    ).compilerHost

    for (const file of this.fileNames) {
      this.#system.writeFile(file, ts.sys.readFile(file)!)
    }
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
    const output = new Map<string, string>()

    program.emit(undefined, (path, data) => {
      const cssScope = this.#cssScopes.get(path)
      let content = data

      if (cssScope) {
        const css = transformCss({
          localClassNames: Array.from(this.#localClassNames),
          composedClassLists: this.#composedClassLists,
          cssObjs: cssScope.css,
        }).join('\n')
        const cssOutputPath = this.getCssOutputPath(path)
        output.set(cssOutputPath, css)

        if (this.#vanillaOptions.imports) {
          const cssImports = Array.from(cssScope.imports).map((importPath) => {
            const scopeImport = this.getCssOutputPath(
              this.getJsOutputPath(importPath)!,
            )
            return `import '${pathFrom(path, scopeImport)}';`
          })
          content = `${cssImports.join('\n')}\n\n${content}`
        }
      }

      output.set(path, content)
    })

    return output
  }

  #createSystem(): ts.System {
    const system = createFSBackedSystem(this.#files, this.#pkg.dirname, ts)
    const writeFile = system.writeFile
    system.writeFile = (filePath, text, writeByteOrderMark) => {
      if (!cssFileFilter.test(filePath)) {
        writeFile(filePath, text, writeByteOrderMark)
        return
      }

      const js = this.#processVanillaFile(filePath, text)
      writeFile(filePath, js, writeByteOrderMark)
    }

    return system
  }

  #createCssAdapter(sourcePath: string): Adapter {
    const { identifier = 'short' } = this.#vanillaOptions
    const jsOutputPath = this.getJsOutputPath(sourcePath)
    invariant(jsOutputPath, `Could not determine output path for ${sourcePath}`)

    return {
      appendCss: (css, fileScope) => {
        const scope = this.#cssScopes.get(jsOutputPath) ?? {
          css: [],
          imports: new Set(),
        }
        scope.css.push(css)
        scope.imports.add(this.#system.resolvePath(fileScope.filePath))
        this.#cssScopes.set(jsOutputPath, scope)
      },
      registerClassName: (className) => {
        this.#localClassNames.add(className)
      },
      registerComposition: (composedClassList) => {
        this.#composedClassLists.push(composedClassList)
      },
      markCompositionUsed: (identifier) => {
        this.#usedCompositions.add(identifier)
      },
      onEndFileScope: () => {},
      getIdentOption: () => identifier,
    }
  }

  #processVanillaFile(filePath: string, content: string): string {
    const transformedSource = this.transformVanilla(filePath, content)
    const cssAdapter = this.#createCssAdapter(filePath)

    const currentNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = originalNodeEnv

    const adapterBoundSource = `
      require('@vanilla-extract/css/adapter').setAdapter(__adapter__);
      ${transformedSource}
    `

    const evalResult = evalCode(
      adapterBoundSource,
      filePath,
      {
        console,
        process,
        __adapter__: cssAdapter,
        require: this.#createVirtualRequire(filePath),
      },
      true,
    ) as Record<string, unknown>

    process.env.NODE_ENV = currentNodeEnv

    evalCode(
      `const { removeAdapter } = require('@vanilla-extract/css/adapter');
      if (removeAdapter) {
        removeAdapter();
      }`,
      filePath,
      { console, process, require: this.#createVirtualRequire(filePath) },
      true,
    )

    const unusedCompositions = this.#composedClassLists
      .filter(({ identifier }) => !this.#usedCompositions.has(identifier))
      .map(({ identifier }) => identifier)

    const unusedCompositionRegex =
      unusedCompositions.length > 0
        ? RegExp(`(${unusedCompositions.join('|')})\\s`, 'g')
        : null

    return serializeVanillaModule([], evalResult, unusedCompositionRegex)
  }

  #createVirtualRequire(containingFile: string) {
    return (moduleId: string) => {
      const module = this.resolveModule(moduleId, containingFile)

      if (module?.isExternalLibraryImport || isBuiltin(moduleId)) {
        return this.#require(moduleId)
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
    const cached = this.#transformCache.get(filePath)
    if (cached) return cached

    const transformed = transformSync({
      filePath,
      identOption: identifier,
      packageName: this.#pkg.name,
      rootPath: this.#pkg.dirname,
      source: content,
    })
    const transpiled = ts.transpile(transformed, this.options)
    this.#transformCache.set(filePath, transpiled)

    return transpiled
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

  getJsOutputPath(fileName: string) {
    const paths = ts.getOutputFileNames(this.#tsConfig, fileName, false)
    return paths.find((path) => path.endsWith('.js'))
  }

  getCssOutputPath(jsOutputPath: string): string {
    const parsed = parse(jsOutputPath)
    const { cssExt } = this.#vanillaOptions
    let cssFilename: string

    if (cssExt) {
      if (parsed.name.endsWith(cssExt)) {
        cssFilename = parsed.name
      } else {
        cssFilename = `${parsed.name}${cssExt}`
      }
    } else {
      cssFilename = `${parsed.name}.ts.vanilla.css`
    }

    return join(parsed.dir, cssFilename)
  }
}
