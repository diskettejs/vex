import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { Vex } from '../src/vex.ts'
import type { ProcessResult } from '../src/types.ts'

const fixtures = (path: string) =>
  fileURLToPath(import.meta.resolve(`./fixtures/${path}`))

function createVex() {
  return new Vex({
    namespace: '@diskette/nex',
    compilerOptions: { outDir: 'dist' },
  })
}

async function processAll(vex: Vex): Promise<ProcessResult[]> {
  const { stream, results } = vex.process()
  for (const _ of stream) {
    // drain the stream
  }
  return (await results).success
}

describe('Vex', () => {
  describe('process', () => {
    test('processes simple style', async () => {
      const filePath = fixtures('simple/styles.css.ts')

      const vex = createVex()
      vex.addSource(filePath)
      const results = await processAll(vex)
      const [result] = results

      // Verify all three outputs exist
      expect(result?.outputs.css.code).toMatchInlineSnapshot(`
        "._15orxqi0 {
          background-color: red;
          font-size: 12;
        }"
      `)
      expect(result?.outputs.js.code).toMatchInlineSnapshot(`
        "import './styles.css.ts.vanilla.css';
        export var container = '_15orxqi0';"
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
      const results = await processAll(vex)
      const [result] = results

      expect(result?.outputs.css.code).toMatchInlineSnapshot(`
        "._7mvs142 {
          container-type: size;
          container-name: _7mvs141;
          width: 500px;
        }
        ._7mvs143 {
          --_7mvs140: blue;
          background-color: var(--_7mvs140);
          padding: 20px;
        }
        @media screen and (min-width: 200px) {
          @container _7mvs141 (min-width: 400px) {
            ._7mvs143 {
              color: white;
            }
          }
        }"
      `)
      expect(result?.outputs.js.code).toMatchInlineSnapshot(`
        "import './styles.css.ts.vanilla.css';
        export var container = '_7mvs142';
        export var block = '_7mvs143';"
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

      const results = await processAll(vex)

      const result = results.find((r) => r.outputs.js.path.includes('styles'))!

      expect(result.outputs.css.code).toMatchInlineSnapshot(`
        "@font-face {
          src: local("Impact");
          font-family: "_1ls6w610";
        }
        @font-face {
          src: local("Comic Sans MS");
          font-family: MyGlobalComicSans;
        }
        @property --_1ls6w614 {
          syntax: "<number>";
          inherits: false;
          initial-value: 0.5;
        }
        ._1ls6w611 {
          display: flex;
          flex-direction: column;
          gap: var(--_2ss7kn4);
          padding: var(--_2ss7kn5);
        }
        ._1ls6w612 {
          z-index: 1;
          position: relative;
        }
        ._1ls6w613 {
          font-family: "_1ls6w610";
          background-color: var(--_2ss7kn1, "THIS FALLBACK VALUE SHOULD NEVER BE USED");
          color: var(--_2ss7kn2);
          border-radius: 9999px;
        }
        ._2ss7kn6 ._2ss7kn0 ._1ls6w611 ._1ls6w613 {
          font-family: MyGlobalComicSans;
          outline: 5px solid red;
        }
        body ._1ls6w612:after {
          content: 'I am content';
        }
        html ._1ls6w616 {
          opacity: var(--_1ls6w614);
        }
        html ._1ls6w617 {
          opacity: var(--_1ls6w614, var(--_1ls6w615, 0.25));
        }
        @media only screen and (min-width: 500px) {
          ._1ls6w611 {
            border: 1px solid var(--_2ss7kn1);
          }
          ._1ls6w613 {
            padding: var(--_2ss7kn3);
          }
        }
        @media only screen and (min-width: 1000px) {
          ._1ls6w613 {
            padding: var(--_2ss7kn4);
          }
        }"
      `)
      expect(result.outputs.js.code).toMatchInlineSnapshot(`
        "import './shared.css.ts.vanilla.css';
        import './themes.css.ts.vanilla.css';
        import './styles.css.ts.vanilla.css';
        export var container = '_1ls6w611';
        export var button = '_1ls6w613 _178hqjy0 _1ls6w612';
        export var opacity = {'1/2':'_1ls6w616','1/4':'_1ls6w617'};"
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

      const results = await processAll(vex)

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
