import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { Vex } from '../src/vex.ts'

const fixtures = (path: string) =>
  fileURLToPath(import.meta.resolve(`./fixtures/${path}`))

function createVex() {
  return new Vex({
    namespace: '@diskette/nex',
    compilerOptions: { outDir: 'dist' },
  })
}

describe('Vex', () => {
  describe('processFiles', () => {
    test('processes simple style', async () => {
      const filePath = fixtures('simple/styles.css.ts')

      const vex = createVex()
      vex.addSource(filePath)
      const { results } = await vex.processFiles()
      const [result] = results

      // Verify all three outputs exist
      expect(result?.outputs.css.code).toMatchInlineSnapshot(`
        ".xdh98w0 {
          background-color: red;
          font-size: 12;
        }"
      `)
      expect(result?.outputs.js.code).toMatchInlineSnapshot(`
        "import './styles.css.ts.vanilla.css';
        export var container = 'xdh98w0';"
      `)
      expect(result?.outputs.dts.code).toMatchInlineSnapshot(`
        "export declare const container: string;
        "
      `)

      // Verify output paths
      expect(result?.outputs.css.path).toMatch(/\.css$/)
      expect(result?.outputs.js.path).toMatch(/\.js$/)
      expect(result?.outputs.dts.path).toMatch(/\.d\.ts$/)
    })

    test('processes complex styles with createVar and createContainer', async () => {
      const filePath = fixtures('low-level/styles.css.ts')

      const vex = createVex()
      vex.addSource(filePath)
      const { results } = await vex.processFiles()
      const [result] = results

      expect(result?.outputs.css.code).toMatchInlineSnapshot(`
        ".vvr6ah2 {
          container-type: size;
          container-name: vvr6ah1;
          width: 500px;
        }
        .vvr6ah3 {
          --vvr6ah0: blue;
          background-color: var(--vvr6ah0);
          padding: 20px;
        }
        @media screen and (min-width: 200px) {
          @container vvr6ah1 (min-width: 400px) {
            .vvr6ah3 {
              color: white;
            }
          }
        }"
      `)
      expect(result?.outputs.js.code).toMatchInlineSnapshot(`
        "import './styles.css.ts.vanilla.css';
        export var block = 'vvr6ah3';
        export var container = 'vvr6ah2';"
      `)
      expect(result?.outputs.dts.code).toMatchInlineSnapshot(`
        "export declare const container: string;
        export declare const block: string;
        "
      `)
    })

    test('processes files with local imports', async () => {
      const vex = createVex()
      vex.addSource(fixtures('themed/shared.css.ts'))
      vex.addSource(fixtures('themed/themes.css.ts'))
      vex.addSource(fixtures('themed/styles.css.ts'))

      const { results } = await vex.processFiles()

      const result = results.find((r) => r.outputs.js.path.includes('styles'))!

      expect(result.outputs.css.code).toMatchInlineSnapshot(`
        "@font-face {
          src: local("Impact");
          font-family: "_1wu32ef0";
        }
        @font-face {
          src: local("Comic Sans MS");
          font-family: MyGlobalComicSans;
        }
        @property --_1wu32ef4 {
          syntax: "<number>";
          inherits: false;
          initial-value: 0.5;
        }
        ._1wu32ef1 {
          display: flex;
          flex-direction: column;
          gap: var(--_14vvur64);
          padding: var(--_14vvur65);
        }
        ._1wu32ef2 {
          z-index: 1;
          position: relative;
        }
        ._1wu32ef3 {
          font-family: "_1wu32ef0";
          background-color: var(--_14vvur61, "THIS FALLBACK VALUE SHOULD NEVER BE USED");
          color: var(--_14vvur62);
          border-radius: 9999px;
        }
        ._14vvur66 ._14vvur60 ._1wu32ef1 ._1wu32ef3 {
          font-family: MyGlobalComicSans;
          outline: 5px solid red;
        }
        body ._1wu32ef2:after {
          content: 'I am content';
        }
        html ._1wu32ef6 {
          opacity: var(--_1wu32ef4);
        }
        html ._1wu32ef7 {
          opacity: var(--_1wu32ef4, var(--_1wu32ef5, 0.25));
        }
        @media only screen and (min-width: 500px) {
          ._1wu32ef1 {
            border: 1px solid var(--_14vvur61);
          }
          ._1wu32ef3 {
            padding: var(--_14vvur63);
          }
        }
        @media only screen and (min-width: 1000px) {
          ._1wu32ef3 {
            padding: var(--_14vvur64);
          }
        }"
      `)
      expect(result.outputs.js.code).toMatchInlineSnapshot(`
        "import './shared.css.ts.vanilla.css';
        import './themes.css.ts.vanilla.css';
        import './styles.css.ts.vanilla.css';
        export var button = '_1wu32ef3 blmny40 _1wu32ef2';
        export var container = '_1wu32ef1';
        export var opacity = {'1/2':'_1wu32ef6','1/4':'_1wu32ef7'};"
      `)
      expect(result.outputs.dts.code).toMatchInlineSnapshot(`
        "export declare const container: string;
        export declare const button: string;
        export declare const opacity: Record<"1/2" | "1/4", string>;
        "
      `)
    })

    test('processes multiple files with glob pattern', async () => {
      const vex = createVex()
      vex.addSource(fixtures('themed/shared.css.ts'))
      vex.addSource(fixtures('themed/themes.css.ts'))
      vex.addSource(fixtures('themed/styles.css.ts'))

      const { results } = await vex.processFiles()

      expect(results).toHaveLength(3)

      // Verify each result has all three outputs with valid paths
      for (const result of results) {
        expect(result.outputs.css.code).toBeDefined()
        expect(result.outputs.js.code).toBeDefined()
        expect(result.outputs.dts.code).toBeDefined()

        expect(result.outputs.css.path).toMatch(/\.css$/)
        expect(result.outputs.js.path).toMatch(/\.js$/)
        expect(result.outputs.dts.path).toMatch(/\.d\.ts$/)
      }

      // Verify specific files were processed
      const paths = results.map((r) => r.outputs.js.path)
      expect(paths.some((p) => p.includes('shared'))).toBe(true)
      expect(paths.some((p) => p.includes('styles'))).toBe(true)
      expect(paths.some((p) => p.includes('themes'))).toBe(true)
    })
  })
})
