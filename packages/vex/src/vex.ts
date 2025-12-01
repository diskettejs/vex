import { transformCss } from '@vanilla-extract/css/transformCss'
import { serializeVanillaModule } from '@vanilla-extract/integration'
import * as esbuild from 'esbuild'
import { createRequire, isBuiltin } from 'node:module'
import vm from 'node:vm'
import { Project, SourceFile, ts, type MemoryEmitResultFile } from 'ts-morph'
import { VanillaAdapter } from './adapter.ts'
import {
  cssFileFilter,
  formatVanillaPaths,
  getEsBuildLoader,
  getOutputPaths,
  invariant,
  looksLikeDirectory,
  parseFileScope,
  pathFrom,
} from './misc.ts'
import type {
  FileErrorEvent,
  FileInfo,
  ProcessFilesOptions,
  ProcessFilesResult,
  ProcessResult,
  VexOptions,
} from './types.ts'

export class Vex {
  #adapter: VanillaAdapter
  #namespace: string
  #require: NodeJS.Require
  #project: Project

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

    this.#project.addSourceFileAtPath(path)
  }

  async processFiles(
    options: ProcessFilesOptions = {},
  ): Promise<ProcessFilesResult> {
    const { onFileStart, onFileComplete, onError, failFast = false } = options

    // This speeds up processing but breaks on files with function exports and also all deps get included as outputs. Need to find a workaround
    // this.#project.resolveSourceFileDependencies()

    const files = this.#project.getSourceFiles()
    const results: ProcessResult[] = []
    const errors: FileErrorEvent[] = []
    const startTime = performance.now()

    const transpiled = new Map(
      await Promise.all(files.map((file) => this.#transform(file))),
    )

    for (let index = 0; index < files.length; index++) {
      const file = files[index]!
      const path = file.getFilePath()

      const fileInfo: FileInfo = { path, index, total: files.length }

      onFileStart?.(fileInfo)
      const fileStartTime = performance.now()

      try {
        const result = this.#process(file, transpiled)
        const duration = performance.now() - fileStartTime

        await onFileComplete?.({ ...fileInfo, result, duration })
        results.push(result)
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        const errorEvent: FileErrorEvent = { ...fileInfo, error }

        onError?.(errorEvent)
        errors.push(errorEvent)

        if (failFast) break
      }
    }

    return {
      results,
      errors,
      totalDuration: performance.now() - startTime,
    }
  }

  #process(file: SourceFile, transpiled: Map<string, string>): ProcessResult {
    this.#adapter.reset()

    const filePath = file.getFilePath()
    const code = transpiled.get(filePath)
    invariant(code, `No transpiled code found for: ${filePath}`)

    const exports = this.#runInVm(filePath, code, transpiled)

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

  async #transform(file: SourceFile): Promise<[string, string]> {
    const source = file.getText()
    const filePath = file.getFilePath()
    const { code } = await esbuild.transform(source, {
      loader: getEsBuildLoader(filePath),
      format: 'cjs',
    })
    const wrapped = `
      const __vanilla_filescope__ = require("@vanilla-extract/css/fileScope");
      __vanilla_filescope__.setFileScope("${filePath}", "${this.#namespace}");
      ${code}
      __vanilla_filescope__.endFileScope();
    `

    return [filePath, wrapped]
  }

  #runInVm(
    filePath: string,
    code: string,
    transpiled: Map<string, string>,
  ): Record<string, unknown> {
    const wrappedCode = `
      require('@vanilla-extract/css/adapter').setAdapter(__adapter__);
      ${code}
    `

    const moduleExports = {}
    const moduleObj = { exports: moduleExports }
    vm.runInNewContext(wrappedCode, {
      __adapter__: this.#adapter,
      console,
      require: this.#createScopedRequire(filePath, transpiled),
      module: moduleObj,
    })

    return moduleObj.exports
  }

  #createScopedRequire(filePath: string, transpiled: Map<string, string>) {
    const scopedRequire = createRequire(filePath)

    return (moduleId: string) => {
      if (isBuiltin(moduleId)) {
        return this.#require(moduleId)
      }

      if (
        !cssFileFilter.test(moduleId) ||
        moduleId.includes('@vanilla-extract')
      ) {
        return scopedRequire(moduleId)
      }

      const resolvedPath = scopedRequire.resolve(moduleId)
      const code = transpiled.get(resolvedPath)
      invariant(code, `No transpiled code found for: ${resolvedPath}`)

      return this.#runInVm(resolvedPath, code, transpiled)
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
