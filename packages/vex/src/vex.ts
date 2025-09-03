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
  type PackageInfo,
} from '@vanilla-extract/integration'
import evalCode from 'eval'
import { createRequire } from 'module'
import { isBuiltin } from 'node:module'
import { join, parse } from 'node:path'
import invariant from 'tiny-invariant'
import ts from 'typescript'
import { pathFrom } from './utils.ts'

export interface VexOptions {
  identifier?: IdentifierOption
  cssExt?: string
  imports?: boolean
}

export type Css = Parameters<Adapter['appendCss']>[0]
export type Composition = Parameters<Adapter['registerComposition']>[0]

/** See https://github.com/vanilla-extract-css/vanilla-extract/blob/master/packages/integration/src/processVanillaFile.ts#L110 */
const originalNodeEnv = process.env.NODE_ENV

export class Vex {
  #pkg: PackageInfo
  #system: ts.System
  #host: ts.CompilerHost
  #tsConfig: ts.ParsedCommandLine

  #vanillaOptions: VexOptions

  #serializedVanilla = new Map<string, string>()
  #transformCache = new Map<string, string>()
  #cssScopes = new Map<string, { css: Css[]; imports: Set<string> }>()
  #localClassNames = new Set<string>()
  #composedClassLists: Composition[] = []
  #usedCompositions = new Set<string>()
  #require: NodeJS.Require

  constructor(tsConfig: ts.ParsedCommandLine, options: VexOptions) {
    this.#vanillaOptions = { imports: true, ...options }
    this.#pkg = getPackageInfo()
    this.#tsConfig = tsConfig

    this.#system = this.#createSystem()
    this.#host = createVirtualCompilerHost(
      this.#system,
      this.options,
      ts,
    ).compilerHost

    this.#require = createRequire(this.#pkg.path)
  }

  get options(): ts.CompilerOptions {
    return this.#tsConfig.options
  }

  emit(compilerOptions: ts.CompilerOptions = this.options) {
    const program = ts.createProgram({
      options: compilerOptions,
      rootNames: this.#tsConfig.fileNames,
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
        // Write generated CSS
        output.set(cssOutputPath, css)

        const js = this.#serializedVanilla.get(path)
        invariant(js, `${path} is missing serialized vanilla module`)
        content = js

        if (this.#vanillaOptions.imports) {
          console.log(cssScope)
          const cssImports = [`import '${pathFrom(path, cssOutputPath)}';`]
          content = `${cssImports.join('\n')}\n\n${content}`
        }
      }

      output.set(path, content)
    })

    return output
  }

  #createSystem(): ts.System {
    const fsMap = new Map<string, string>()
    const system = createFSBackedSystem(fsMap, this.#pkg.dirname, ts)

    const readFile = system.readFile
    system.readFile = (path: string, encoding?: string) => {
      const text = readFile(path, encoding)
      if (!cssFileFilter.test(path)) {
        return text
      }
      if (text) {
        const outputPath = this.getJsOutputPath(path)
        if (outputPath) {
          const cssAdapter = this.#createCssAdapter(outputPath)
          const js = this.#processVanillaFile(path, text, cssAdapter)
          this.#serializedVanilla.set(outputPath, js)
        }

        return text
      }
    }

    return system
  }

  #processVanillaFile(
    filePath: string,
    content: string,
    cssAdapter: Adapter,
  ): string {
    const transformedSource = this.transformVanilla(filePath, content)

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

      if (
        moduleId.includes('@vanilla-extract') ||
        module?.isExternalLibraryImport ||
        isBuiltin(moduleId)
      ) {
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

  #createCssAdapter(jsOutputPath: string): Adapter {
    const { identifier = 'short' } = this.#vanillaOptions

    return {
      appendCss: (css, fileScope) => {
        const scope = this.#cssScopes.get(jsOutputPath) ?? {
          css: [],
          imports: new Set(),
        }
        scope.css.push(css)
        // Resolve the file path relative to the project root
        const resolvedPath = this.#system.resolvePath(fileScope.filePath)
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

  getJsOutputPath(fileName: string): string | undefined {
    try {
      const paths = ts.getOutputFileNames(this.#tsConfig, fileName, false)

      return paths.find((path) => path.endsWith('.js'))
    } catch (error) {
      console.warn(`Could not determine output path for ${fileName}`)
    }
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
