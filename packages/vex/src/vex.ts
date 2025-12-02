import { transformCss } from '@vanilla-extract/css/transformCss'
import { serializeVanillaModule } from '@vanilla-extract/integration'
import { createRequire, isBuiltin } from 'node:module'
import vm from 'node:vm'
import { Project, SourceFile, ts, type MemoryEmitResultFile } from 'ts-morph'
import { VanillaAdapter } from './adapter.ts'
import {
  cssFileFilter,
  formatVanillaPaths,
  getOutputPaths,
  invariant,
  looksLikeDirectory,
  parseFileScope,
  pathFrom,
  tsFileFilter,
} from './misc.ts'
import type {
  FileErrorEvent,
  FileInfo,
  ProcessEvent,
  ProcessResult,
  StreamOptions,
  VexOptions,
} from './types.ts'

export class Vex {
  #adapter: VanillaAdapter
  #namespace: string
  #require: NodeJS.Require
  #project: Project
  #transpiled = new WeakMap<SourceFile, string>()

  constructor(options: VexOptions) {
    this.#adapter = new VanillaAdapter(options.identifier ?? 'short')
    this.#namespace = options.namespace
    this.#require = createRequire(import.meta.url)

    this.#project = new Project({
      compilerOptions: options.compilerOptions,
      defaultCompilerOptions: {
        outDir: 'dist',
        declaration: true,
      },
    })
    const { sources } = options
    if (sources) {
      typeof sources === 'string'
        ? this.addSource(sources)
        : sources.map((s) => this.addSource(s))
    }
  }

  get compilerOptions(): ts.CompilerOptions {
    return this.#project.compilerOptions.get()
  }

  get files(): string[] {
    return this.#project.getSourceFiles().map((sf) => sf.getFilePath())
  }

  addSource(path: string): void {
    const isGlob = /[*?{}[\]]/.test(path) || path.includes('**')
    if (isGlob) {
      this.#project.addSourceFilesAtPaths(path)
      return
    }

    if (looksLikeDirectory(path)) {
      this.#project.addSourceFilesAtPaths(formatVanillaPaths(path))
      return
    }

    this.#project.addSourceFileAtPathIfExists(path)
  }

  process(options: StreamOptions = {}): {
    stream: Generator<ProcessEvent>
    results: Promise<{
      success: ProcessResult[]
      errors: FileErrorEvent[]
      totalDuration: number
    }>
  } {
    const generator = this.#process(options)

    const success: ProcessResult[] = []
    const errors: FileErrorEvent[] = []
    let totalDuration = 0

    const results = new Promise<{
      success: ProcessResult[]
      errors: FileErrorEvent[]
      totalDuration: number
    }>((resolve) => {
      const originalNext = generator.next.bind(generator)
      generator.next = (...args) => {
        const result = originalNext(...args)
        if (!result.done) {
          const event = result.value
          if (event.type === 'complete') {
            success.push(event.result)
          } else if (event.type === 'error') {
            errors.push({ ...event.file, error: event.error })
          } else if (event.type === 'done') {
            totalDuration = event.totalDuration
            resolve({ success, errors, totalDuration })
          }
        }
        return result
      }
    })

    return { stream: generator, results }
  }

  *#process(options: StreamOptions = {}): Generator<ProcessEvent> {
    const { failFast = false } = options

    this.#project.resolveSourceFileDependencies()
    const files: SourceFile[] = []

    for (const sf of this.#project.getSourceFiles()) {
      const isVanillaFile = cssFileFilter.test(sf.getFilePath())
      if (isVanillaFile) {
        files.push(sf)
      }
      this.#transpiled.set(
        sf,
        this.#transform(sf, { wrapInScope: isVanillaFile }),
      )
    }

    const startTime = performance.now()

    for (let index = 0; index < files.length; index++) {
      const file = files[index]!
      const path = file.getFilePath()
      const fileInfo: FileInfo = { path, index, total: files.length }

      yield { type: 'start', file: fileInfo }

      const fileStartTime = performance.now()

      try {
        const result = this.#processFile(file)
        const duration = performance.now() - fileStartTime

        yield { type: 'complete', file: fileInfo, result, duration }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        yield { type: 'error', file: fileInfo, error }

        if (failFast) break
      }
    }

    yield { type: 'done', totalDuration: performance.now() - startTime }
  }

  #processFile(file: SourceFile): ProcessResult {
    this.#adapter.reset()

    const exports = this.#runInVm(file)

    const paths = getOutputPaths(file)

    const cssImports: string[] = []
    let cssContent = ''

    const cssByFileScope = this.#adapter.cssByFileScope

    for (const [serialisedFileScope, fileScopeCss] of cssByFileScope) {
      const fileScope = parseFileScope(serialisedFileScope)
      cssContent = transformCss({
        localClassNames: Array.from(this.#adapter.localClassNames),
        composedClassLists: this.#adapter.composedClassLists,
        cssObjs: fileScopeCss,
      }).join('\n')

      const fileScopeSource = this.#project.getSourceFile(fileScope.filePath)
      invariant(
        fileScopeSource,
        `Source file not found for file scope: ${fileScope.filePath}`,
      )
      const fileScopePaths = getOutputPaths(fileScopeSource)

      cssImports.push(`import '${pathFrom(paths.js, fileScopePaths.css)}';`)
    }

    const unusedCompositions = this.#adapter.composedClassLists
      .filter(
        ({ identifier }) => !this.#adapter.usedCompositions.has(identifier),
      )
      .map(({ identifier }) => identifier)

    const unusedCompositionRegex =
      unusedCompositions.length > 0
        ? RegExp(`(${unusedCompositions.join('|')})\\s`, 'g')
        : null

    const jsCode = serializeVanillaModule(
      cssImports,
      exports,
      unusedCompositionRegex,
    )

    const dts = this.#getFileEmit(file)
    const sourcePath = file.getFilePath()

    return {
      source: sourcePath,
      outputs: {
        js: { code: jsCode, path: paths.js },
        css: { code: cssContent, path: paths.css },
        dts: { code: dts.text, path: paths.dts },
      },
    }
  }

  #transform(file: SourceFile, options?: { wrapInScope?: boolean }): string {
    const filePath = file.getFilePath()
    const code = ts.transpile(file.getText(), {
      module: ts.ModuleKind.CommonJS,
    })
    let source = code

    if (options?.wrapInScope) {
      source = `
      const __vanilla_css_adapter__ = require("@vanilla-extract/css/adapter");
      __vanilla_css_adapter__.setAdapter(__adapter__);

      const __vanilla_filescope__ = require("@vanilla-extract/css/fileScope");
      __vanilla_filescope__.setFileScope("${filePath}", "${this.#namespace}");
      ${code}
      __vanilla_filescope__.endFileScope();
      __vanilla_css_adapter__.removeAdapter();
    `
    }

    return source
  }

  #runInVm(file: SourceFile): Record<string, unknown> {
    const code = this.#transpiled.get(file)
    const filePath = file.getFilePath()
    invariant(code, `${filePath} has not been transpiled`)

    const moduleExports = {}
    const moduleObj = { exports: moduleExports }
    vm.runInNewContext(code, {
      __adapter__: this.#adapter,
      console,
      require: this.#createScopedRequire(filePath),
      module: moduleObj,
      exports: moduleExports,
    })

    return moduleObj.exports
  }

  #createScopedRequire(filePath: string) {
    const scopedRequire = createRequire(filePath)

    return (moduleId: string) => {
      if (isBuiltin(moduleId)) {
        return this.#require(moduleId)
      }

      const resolvedPath = scopedRequire.resolve(moduleId)
      const shouldProcess =
        (cssFileFilter.test(moduleId) &&
          !moduleId.includes('@vanilla-extract')) ||
        tsFileFilter.test(resolvedPath)

      if (!shouldProcess) {
        return scopedRequire(moduleId)
      }

      const sourceFile = this.#project.getSourceFile(resolvedPath)
      invariant(sourceFile, `Source file not found for: ${resolvedPath}`)

      return this.#runInVm(sourceFile)
    }
  }

  #getFileEmit(file: SourceFile): MemoryEmitResultFile {
    const emit = this.#project.emitToMemory({
      emitOnlyDtsFiles: true,
      targetSourceFile: file,
    })

    const emitFile = emit.getFiles()[0]
    invariant(emitFile)
    return emitFile
  }
}
