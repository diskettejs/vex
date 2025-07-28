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
import { pathFrom, readConfig } from './utils.ts'

export type Css = Parameters<Adapter['appendCss']>[0]
export type Composition = Parameters<Adapter['registerComposition']>[0]

/** See https://github.com/vanilla-extract-css/vanilla-extract/blob/master/packages/integration/src/processVanillaFile.ts#L110 */
const originalNodeEnv = process.env.NODE_ENV

export interface VexOptions {
  identifier?: IdentifierOption
  cssExt?: string
  imports?: boolean
  configPath?: string
}

export class Vex {
  #pkg = getPackageInfo()
  #configPath: string
  #tsConfig: ts.ParsedCommandLine
  #transformCache = new Map<string, string>()

  #vanillaOptions: VexOptions
  #host: ts.CompilerHost

  #cssScopes = new Map<string, { css: Css[]; imports: Set<string> }>()
  #localClassNames = new Set<string>()
  #composedClassLists: Composition[] = []
  #usedCompositions = new Set<string>()
  #require: NodeJS.Require

  constructor(options: VexOptions = {}) {
    this.#vanillaOptions = { imports: true, ...options }
    this.#configPath = options.configPath ?? process.cwd()
    this.#tsConfig = readConfig(this.#configPath)

    this.#host = ts.createCompilerHost(this.#tsConfig.options)
    this.#require = createRequire(this.#pkg.path)
  }

  /** Compiler options */
  get options(): ts.CompilerOptions {
    return this.#tsConfig.options
  }

  compile(options: ts.CompilerOptions = {}) {
    const host: ts.CompilerHost = {
      ...this.#host,
      getSourceFile: (
        fileName,
        languageVersionOrOptions,
        onError,
        shouldCreateNewSourceFile,
      ) => {
        const source = this.#host.getSourceFile(
          fileName,
          languageVersionOrOptions,
          onError,
          shouldCreateNewSourceFile,
        )
        if (!cssFileFilter.test(fileName) || !source) {
          return source
        }
        const processed = this.#processVanillaFile(fileName, source.text)

        return ts.createSourceFile(
          source.fileName,
          processed,
          languageVersionOrOptions,
          shouldCreateNewSourceFile,
        )
      },
      writeFile: this.#writeFile.bind(this),
    }

    const program = ts.createProgram({
      options: { ...this.options, ...options },
      rootNames: this.#tsConfig.fileNames,
      projectReferences: this.#tsConfig.projectReferences,
      host,
    })

    program.emit()
  }

  watch(options?: ts.CompilerOptions) {
    const sys: ts.System = {
      ...ts.sys,
      readFile: (path, encoding) => {
        const content = ts.sys.readFile(path, encoding)
        if (!cssFileFilter.test(path) || !content) {
          return content
        }

        return this.#processVanillaFile(path, content)
      },
      writeFile: this.#writeFile.bind(this),
    }
    const host = ts.createWatchCompilerHost(
      this.#configPath,
      options,
      sys,
      ts.createEmitAndSemanticDiagnosticsBuilderProgram,
    )

    return ts.createWatchProgram(host)
  }

  #emit(path: string, data: string, writeByteOrderMark?: boolean): void {
    const cssScope = this.#cssScopes.get(path)
    let content = data

    if (cssScope) {
      const css = transformCss({
        localClassNames: Array.from(this.#localClassNames),
        composedClassLists: this.#composedClassLists,
        cssObjs: cssScope.css,
      }).join('\n')
      const cssOutputPath = this.getCssOutputPath(path)
      // Write generated CSS
      ts.sys.writeFile(cssOutputPath, css, writeByteOrderMark)

      if (this.#vanillaOptions.imports) {
        const cssImports = Array.from(cssScope.imports).map((_importPath) => {
          const scopeImport = this.getCssOutputPath(path)
          return `import '${pathFrom(path, scopeImport)}';`
        })
        content = `${cssImports.join('\n')}\n\n${content}`
      }
    }

    ts.sys.writeFile(path, content, writeByteOrderMark)
  }

  #writeFile(path: string, data: string, writeByteOrderMark?: boolean): void {
    if (!cssFileFilter.test(path)) {
      return ts.sys.writeFile(path, data, writeByteOrderMark)
    }
    this.#emit(path, data, writeByteOrderMark)
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
        // Resolve the file path relative to the project root
        const resolvedPath = ts.sys.resolvePath(fileScope.filePath)
        scope.imports.add(resolvedPath)
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

    const require = this.#createVirtualRequire(filePath)
    const evalResult = evalCode(
      adapterBoundSource,
      filePath,
      {
        console,
        process,
        __adapter__: cssAdapter,
        require,
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
      { console, process, require },
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
      const module = ts.resolveModuleName(
        moduleId,
        containingFile,
        this.options,
        this.#host,
      ).resolvedModule

      // Special handling for motif/style - treat it as local module to get proper transformation
      if (moduleId === '@diskette/motif/style') {
        const motifStylePath = this.#require.resolve(moduleId)
        const content = ts.sys.readFile(motifStylePath)
        invariant(content)
        return this.#evalCode(motifStylePath, content)
      }

      if (module?.isExternalLibraryImport || isBuiltin(moduleId)) {
        return this.#require(moduleId)
      }

      if (!module?.resolvedFileName) return
      const filePath = module.resolvedFileName
      const content = ts.sys.readFile(filePath)

      invariant(content)
      return this.#evalCode(filePath, content)
    }
  }

  #evalCode(
    filename: string,
    content: string,
    scope?: Record<string, unknown>,
  ): unknown {
    const js = this.transformVanilla(filename, content)

    return evalCode(js, filename, {
      console,
      process,
      require: this.#createVirtualRequire(filename),
      ...scope,
    })
  }

  transformVanilla(filePath: string, content: string): string {
    const cached = this.#transformCache.get(filePath)
    if (cached) return cached

    const transformed = transformSync({
      filePath,
      identOption: this.#vanillaOptions.identifier ?? 'short',
      packageName: this.#pkg.name,
      rootPath: this.#pkg.dirname,
      source: content,
    })
    const transpiled = ts.transpile(transformed, this.options)
    this.#transformCache.set(filePath, transpiled)

    return transpiled
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
