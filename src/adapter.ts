import type { Adapter, FileScope } from '@vanilla-extract/css'
import { stringifyFileScope } from '@vanilla-extract/integration'
import type { IdentifierOption } from './types.ts'

export type Css = Parameters<Adapter['appendCss']>[0]
export type Composition = Parameters<Adapter['registerComposition']>[0]

export class VanillaAdapter implements Adapter {
  #cssObjs: Css[] = []
  readonly cssByFileScope: Map<string, Css[]> = new Map()
  #localClassNames = new Set<string>()
  #composedClassLists: Composition[] = []
  #usedCompositions = new Set<string>()
  #identifier: IdentifierOption

  constructor(identifier: IdentifierOption = 'short') {
    this.#identifier = identifier
  }

  get cssObjs(): Css[] {
    return this.#cssObjs
  }

  get composedClassLists(): Composition[] {
    return this.#composedClassLists
  }

  get usedCompositions(): Set<string> {
    return this.#usedCompositions
  }

  get localClassNames(): Set<string> {
    return this.#localClassNames
  }

  appendCss(css: Css, fileScope: FileScope): void {
    const serialisedFileScope = stringifyFileScope(fileScope)
    const fileScopeCss = this.cssByFileScope.get(serialisedFileScope) ?? []

    fileScopeCss.push(css)

    this.cssByFileScope.set(serialisedFileScope, fileScopeCss)
  }

  registerClassName(className: string, _fileScope: FileScope): void {
    this.#localClassNames.add(className)
  }

  registerComposition(composition: Composition, _fileScope: FileScope): void {
    this.#composedClassLists.push(composition)
  }

  markCompositionUsed(identifier: string): void {
    this.#usedCompositions.add(identifier)
  }

  onBeginFileScope(_fileScope: FileScope): void {}
  onEndFileScope(_fileScope: FileScope): void {}

  getIdentOption(): IdentifierOption {
    return this.#identifier
  }
}
