import { transformCss } from '@vanilla-extract/css/transformCss'
import {
  parseFileScope,
  serializeVanillaModule,
} from '@vanilla-extract/integration'
import * as esbuild from 'esbuild'
import { createRequire } from 'node:module'
import { relative } from 'node:path'
import vm from 'node:vm'
import { VanillaAdapter } from './adapter.ts'
import type { PackageInfo, ProcessOptions, ProcessResult } from './types.ts'

export class Nex {
  #adapter: VanillaAdapter
  #pkg: PackageInfo
  #require: NodeJS.Require

  constructor(options: ProcessOptions) {
    this.#adapter = new VanillaAdapter(options.identifier ?? 'short')
    this.#pkg = options.pkg
    this.#require = createRequire(import.meta.url)
  }

  process(filePath: string, source: string) {
    const transformed = this.#addFileScope(source, filePath)

    const exports = this.#runInVm(transformed, filePath)

    const output = new Map<string, { content: string; imports: Set<string> }>()

    for (const [serialisedFileScope, fileScopeCss] of this.#adapter
      .cssByFileScope) {
      const fileScope = parseFileScope(serialisedFileScope)
      const css = transformCss({
        localClassNames: Array.from(this.#adapter.localClassNames),
        composedClassLists: this.#adapter.composedClassLists,
        cssObjs: fileScopeCss,
      }).join('\n')

      const fileName = `${fileScope.filePath}.vanilla.css`
      const obj = output.get(fileName)
      if (obj) {
        obj.imports.add(`import '${fileName}';`)
      } else {
        output.set(fileName, { content: css, imports: new Set() })
      }
    }

    const { removeAdapter } = this.#require('@vanilla-extract/css/adapter')
    if (removeAdapter) {
      removeAdapter()
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

    const js = serializeVanillaModule([], exports, unusedCompositionRegex)

    return { js, css: output }
  }

  #addFileScope(source: string, filePath: string): string {
    const normalizedPath = relative(this.#pkg.dirname, filePath).replace(
      /\\/g,
      '/',
    )

    return `
      const __vanilla_filescope__ = require("@vanilla-extract/css/fileScope");
      __vanilla_filescope__.setFileScope("${normalizedPath}", "${this.#pkg.name}");
      ${source}
      __vanilla_filescope__.endFileScope();
    `
  }

  #runInVm(code: string, path: string): Record<string, unknown> {
    const wrappedCode = `
      require('@vanilla-extract/css/adapter').setAdapter(__adapter__);
      ${code}
    `

    const moduleExports = {}
    const moduleObj = { exports: moduleExports }

    vm.runInNewContext(wrappedCode, {
      __adapter__: this.#adapter,
      console,
      require: createRequire(path),
      module: moduleObj,
    })

    return moduleObj.exports
  }
}
