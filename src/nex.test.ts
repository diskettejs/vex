import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { Nex } from './nex.ts'
import type { PackageInfo } from './types.ts'

const projectRoot = join(import.meta.dirname, '..')
const fixturesDir = join(projectRoot, 'fixtures')

const pkg: PackageInfo = {
  name: '@diskette/nex',
  dirname: projectRoot,
  path: '',
}

describe('Nex', () => {
  test('processes simple style', async () => {
    const filePath = join(fixturesDir, 'styles.css.ts')
    const source = await readFile(filePath, 'utf-8')

    const nex = new Nex({ pkg })
    const result = await nex.process(filePath, source)
    console.log()
    // expect(result.css).toMatchInlineSnapshot(`
    //   ".jxk2790 {
    //     background-color: red;
    //     font-size: 12;
    //   }"
    // `)
    // expect(result.js).toMatchInlineSnapshot(
    //   `"export var container = 'jxk2790';"`,
    // )
  })

  test.skip('processes complex styles with createVar and createContainer', async () => {
    const filePath = join(fixturesDir, 'low-level.css.ts')
    const source = await readFile(filePath, 'utf-8')

    const nex = new Nex({ pkg })
    const result = await nex.process(filePath, source)

    expect(result.css).toMatchInlineSnapshot(`
      "._1emj2n72 {
        container-type: size;
        container-name: _1emj2n71;
        width: 500px;
      }
      ._1emj2n73 {
        --_1emj2n70: blue;
        background-color: var(--_1emj2n70);
        padding: 20px;
      }
      @media screen and (min-width: 200px) {
        @container _1emj2n71 (min-width: 400px) {
          ._1emj2n73 {
            color: white;
          }
        }
      }"
    `)
    expect(result.js).toMatchInlineSnapshot(`
      "export var block = '_1emj2n73';
      export var container = '_1emj2n72';"
    `)
  })

  test.skip('processes files with local imports', async () => {
    const filePath = join(fixturesDir, 'themed/styles.css.ts')
    const source = await readFile(filePath, 'utf-8')

    const nex = new Nex({ pkg })
    const result = await nex.process(filePath, source)

    expect(result.css).toMatchInlineSnapshot(`
      "@font-face {
        src: local("Impact");
        font-family: "_1ix0yh0";
      }
      @font-face {
        src: local("Comic Sans MS");
        font-family: MyGlobalComicSans;
      }
      @property --_1ix0yh4 {
        syntax: "<number>";
        inherits: false;
        initial-value: 0.5;
      }
      @layer _1932f3n7;
      @layer globalThemeLayer;
      ._3ljbah0 {
        box-shadow: 0 0 5px red;
      }
      body {
        background-color: skyblue;
      }
      body, button {
        line-height: 16px;
      }
      :root, ._1932f3n0 {
        --_1932f3n1: blue;
        --_1932f3n2: white;
        --_1932f3n3: 4px;
        --_1932f3n4: 8px;
        --_1932f3n5: 12px;
      }
      ._1932f3n6 {
        --_1932f3n1: green;
        --_1932f3n2: white;
        --_1932f3n3: 8px;
        --_1932f3n4: 12px;
        --_1932f3n5: 16px;
      }
      ._1932f3ne {
        --_1932f3n1: pink;
        --_1932f3n2: purple;
        --_1932f3n3: 6px;
        --_1932f3n4: 12px;
        --_1932f3n5: 18px;
      }
      ._1ix0yh1 {
        display: flex;
        flex-direction: column;
        gap: var(--_1932f3n4);
        padding: var(--_1932f3n5);
      }
      ._1ix0yh2 {
        z-index: 1;
        position: relative;
      }
      ._1ix0yh3 {
        font-family: "_1ix0yh0";
        background-color: var(--_1932f3n1, "THIS FALLBACK VALUE SHOULD NEVER BE USED");
        color: var(--_1932f3n2);
        border-radius: 9999px;
      }
      ._1932f3n6 ._1932f3n0 ._1ix0yh1 ._1ix0yh3 {
        font-family: MyGlobalComicSans;
        outline: 5px solid red;
      }
      body ._1ix0yh2:after {
        content: 'I am content';
      }
      html ._1ix0yh6 {
        opacity: var(--_1ix0yh4);
      }
      html ._1ix0yh7 {
        opacity: var(--_1ix0yh4, var(--_1ix0yh5, 0.25));
      }
      @layer _1932f3n7 {
        ._1932f3n8 {
          --_1932f3n9: green;
          --_1932f3na: white;
          --_1932f3nb: 8px;
          --_1932f3nc: 12px;
          --_1932f3nd: 16px;
        }
      }
      @layer globalThemeLayer {
        :root {
          --_1932f3n9: green;
          --_1932f3na: white;
          --_1932f3nb: 8px;
          --_1932f3nc: 12px;
          --_1932f3nd: 16px;
        }
      }
      @media screen and (min-width: 768px) {
        ._1932f3ne {
          --_1932f3n1: purple;
          --_1932f3n2: pink;
        }
      }
      @media only screen and (min-width: 500px) {
        ._1ix0yh1 {
          border: 1px solid var(--_1932f3n1);
        }
        ._1ix0yh3 {
          padding: var(--_1932f3n3);
        }
      }
      @media only screen and (min-width: 1000px) {
        ._1ix0yh3 {
          padding: var(--_1932f3n4);
        }
      }"
    `)
    // This is missing an imports
    expect(result.js).toMatchInlineSnapshot(`
      "export var button = '_1ix0yh3 _3ljbah0 _1ix0yh2';
      export var container = '_1ix0yh1';
      export var opacity = {'1/2':'_1ix0yh6','1/4':'_1ix0yh7'};"
    `)
  })
})
