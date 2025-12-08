import { Repeater } from '@repeaterjs/repeater'
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
  BuildEvent,
  CompileResult,
  FileErrorEvent,
  FileInfo,
  FileMapping,
  VexOptions,
} from './types.ts'

export class Vex {
  #adapter: VanillaAdapter
  #namespace: string
  #require: NodeJS.Require
  #project: Project
  #transpiled = new Map<string, string>()

  constructor(options: VexOptions) {
    this.#adapter = new VanillaAdapter(options.identifier ?? 'short')
    this.#namespace = options.namespace
    this.#require = createRequire(import.meta.url)

    this.#project = new Project({
      compilerOptions: options.compilerOptions,
      defaultCompilerOptions: {
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

  get files(): FileMapping[] {
    const files = []
    for (const sf of this.#project.getSourceFiles()) {
      const source = sf.getFilePath()
      if (cssFileFilter.test(source)) {
        const paths = getOutputPaths(sf)
        files.push({ source, output: paths.js })
      }
    }
    return files
  }

  addSource(path: string): void {
    if (looksLikeDirectory(path)) {
      this.#project.addSourceFilesAtPaths(formatVanillaPaths(path))
      return
    }

    this.#project.addSourceFileAtPathIfExists(path)
  }

  build(): Repeater<BuildEvent> {
    return new Repeater(async (push, stop) => {
      this.#project.resolveSourceFileDependencies()
      const sourceFiles = this.#project.getSourceFiles()
      const files: SourceFile[] = []

      for (let index = 0; index < sourceFiles.length; index++) {
        const sf = sourceFiles[index]!
        const path = sf.getFilePath()

        await push({
          type: 'transpile',
          file: { path, index, total: sourceFiles.length },
        })

        const isVanillaFile = cssFileFilter.test(path)
        if (isVanillaFile) {
          files.push(sf)
        }
        this.#transpiled.set(
          path,
          this.#transpile(sf, { wrapInScope: isVanillaFile }),
        )
      }

      const startTime = performance.now()
      const results: CompileResult[] = []
      const errors: FileErrorEvent[] = []

      for (let index = 0; index < files.length; index++) {
        const file = files[index]!
        const path = file.getFilePath()
        const fileInfo: FileInfo = { path, index, total: files.length }

        await push({ type: 'start', file: fileInfo })

        const fileStartTime = performance.now()

        try {
          const result = this.#compileSource(file)
          const duration = performance.now() - fileStartTime

          results.push(result)
          await push({ type: 'complete', file: fileInfo, result, duration })
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err))
          errors.push({ ...fileInfo, error })
        }
      }

      await push({
        type: 'done',
        results,
        errors,
        totalDuration: performance.now() - startTime,
      })
      stop()
    })
  }

  /**
   * Invalidates a changed file and returns affected `.css.ts` files.
   * - Refreshes the file from disk and re-transpiles it.
   * - If the file is a `.css.ts` file, returns it directly.
   * - Otherwise, returns `.css.ts` files that directly import this file.
   */
  invalidate(changedPath: string): string[] {
    const file = this.#project.getSourceFile(changedPath)
    if (!file) return []

    file.refreshFromFileSystemSync()

    // Re-transpile the changed file
    const isCssFile = cssFileFilter.test(changedPath)
    this.#transpiled.set(
      changedPath,
      this.#transpile(file, { wrapInScope: isCssFile }),
    )
    if (isCssFile) {
      return [changedPath]
    }

    const files: string[] = []
    // Find .css.ts files that directly import this file
    for (const sf of file.getReferencingSourceFiles()) {
      const path = sf.getFilePath()
      if (cssFileFilter.test(path)) {
        files.push(path)
      }
    }

    return files
  }

  compile(filePath: string): CompileResult {
    const file = this.#project.getSourceFile(filePath)
    invariant(file, `Source file not found: ${filePath}`)

    return this.#compileSource(file)
  }

  #compileSource(file: SourceFile): CompileResult {
    this.#adapter.reset()

    const exports = this.#execute(file)

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

    const dts = this.#emitDts(file)
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

  #transpile(file: SourceFile, options?: { wrapInScope?: boolean }): string {
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

  #execute(file: SourceFile): Record<string, unknown> {
    const filePath = file.getFilePath()
    const code = this.#transpiled.get(filePath)
    invariant(code, `${filePath} has not been transpiled`)

    const moduleExports = {}
    const moduleObj = { exports: moduleExports }
    vm.runInNewContext(code, {
      __adapter__: this.#adapter,
      console,
      require: this.#createRequire(filePath),
      module: moduleObj,
      exports: moduleExports,
    })

    return moduleObj.exports
  }

  #createRequire(filePath: string) {
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

      return this.#execute(sourceFile)
    }
  }

  #emitDts(file: SourceFile): MemoryEmitResultFile {
    const emit = this.#project.emitToMemory({
      emitOnlyDtsFiles: true,
      targetSourceFile: file,
    })

    const emitFile = emit.getFiles()[0]
    invariant(emitFile)
    return emitFile
  }
}
