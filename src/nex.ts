import { transformCss } from '@vanilla-extract/css/transformCss'
import { serializeVanillaModule } from '@vanilla-extract/integration'
import * as esbuild from 'esbuild'
import { createRequire, isBuiltin } from 'node:module'
import vm from 'node:vm'
import { Project, SourceFile, ts } from 'ts-morph'
import { VanillaAdapter } from './adapter.ts'
import {
  cssFileFilter,
  getOutputPaths,
  invariant,
  parseFileScope,
  pathFrom,
} from './misc.ts'
import type { NexOptions, PackageInfo, ProcessResult } from './types.ts'

export class Nex {
  #adapter: VanillaAdapter
  #pkg: PackageInfo
  #require: NodeJS.Require
  #project: Project

  constructor(options: NexOptions) {
    this.#adapter = new VanillaAdapter(options.identifier ?? 'short')
    this.#pkg = options.pkgInfo
    this.#require = createRequire(import.meta.url)

    this.#project = new Project({
      tsConfigFilePath: options.tsconfig,
      compilerOptions: options.compilerOptions,
      skipAddingFilesFromTsConfig: true,
      defaultCompilerOptions: {
        outDir: 'dist',
        declaration: true,
      },
    })
  }

  async addSource(filePath: string): Promise<void> {
    await this.#project.addSourceFileAtPath(filePath)
  }

  async *processFiles(): AsyncGenerator<ProcessResult> {
    const files = this.#project.getSourceFiles()

    for (const file of files) {
      yield this.#process(file)
    }
  }

  #process(file: SourceFile): ProcessResult {
    this.#adapter.reset()

    const transformed = this.#addFileScope(file)

    const exports = this.#runInVm(file, transformed)

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

    const dts = ts.transpileDeclaration(jsCode, {
      compilerOptions: this.#project.compilerOptions.get(),
    })
    const sourcePath = file.getFilePath()
    return {
      source: sourcePath,
      outputs: {
        js: { code: jsCode, path: paths.js },
        css: { code: cssContent, path: paths.css },
        dts: { code: dts.outputText, path: paths.dts },
      },
    }
  }

  #addFileScope(file: SourceFile): string {
    const source = file.getText()
    const filePath = file.getFilePath()
    // TODO: move this out of this method
    const { code } = esbuild.transformSync(source, {
      loader: 'ts',
      format: 'cjs',
    })

    return `
      const __vanilla_filescope__ = require("@vanilla-extract/css/fileScope");
      __vanilla_filescope__.setFileScope("${filePath}", "${this.#pkg.name}");
      ${code}
      __vanilla_filescope__.endFileScope();
    `
  }

  #runInVm(file: SourceFile, code: string): Record<string, unknown> {
    const wrappedCode = `
      require('@vanilla-extract/css/adapter').setAdapter(__adapter__);
      ${code}
    `

    const moduleExports = {}
    const moduleObj = { exports: moduleExports }
    vm.runInNewContext(wrappedCode, {
      __adapter__: this.#adapter,
      console,
      require: this.#createScopedRequire(file),
      module: moduleObj,
    })

    return moduleObj.exports
  }

  #createScopedRequire(
    file: SourceFile,
    options?: { blockedModules?: string[]; allowedBuiltins?: string[] },
  ) {
    const path = file.getFilePath()
    const scopedRequire = createRequire(path)
    const { allowedBuiltins = [], blockedModules = [] } = options ?? {}

    return (moduleId: string) => {
      if (blockedModules.includes(moduleId)) {
        throw new Error(`Module "${moduleId}" is not allowed`)
      }

      if (isBuiltin(moduleId)) {
        if (
          allowedBuiltins &&
          !allowedBuiltins.includes(moduleId.replace(/^node:/, ''))
        ) {
          throw new Error(`Built-in module "${moduleId}" is not allowed`)
        }
        return this.#require(moduleId)
      }

      if (
        !cssFileFilter.test(moduleId) ||
        moduleId.includes('@vanilla-extract')
      ) {
        return scopedRequire(moduleId)
      }

      const resolvedPath = scopedRequire.resolve(moduleId)
      let sourceFile = this.#project.getSourceFile(resolvedPath)
      invariant(sourceFile, `Source file not found in project: ${resolvedPath}`)

      return this.#runInVm(file, this.#addFileScope(sourceFile))
    }
  }
}
