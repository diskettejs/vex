import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import type { PackageInfo, ProcessResult } from '../src/types.ts'
import { Vex } from '../src/vex.ts'

const projectRoot = join(import.meta.dirname, '..')
const fixtures = (path: string) =>
  fileURLToPath(import.meta.resolve(`./fixtures/${path}`))

const pkg: PackageInfo = {
  name: '@diskette/nex',
  dirname: projectRoot,
  path: projectRoot,
}

function createNex() {
  return new Vex({
    tsconfig: join(projectRoot, 'tsconfig.json'),
    pkgInfo: pkg,
    compilerOptions: { outDir: 'dist' },
  })
}

describe('Nex', () => {
  describe('processFiles', () => {
    test('processes simple style', async () => {
      const filePath = fixtures('simple/styles.css.ts')

      const nex = createNex()
      await nex.addSource(filePath)
      const [result] = await Array.fromAsync(nex.processFiles())

      // Verify all three outputs exist
      expect(result?.outputs.css.code).toMatchInlineSnapshot(`
        ".bvos4v0 {
          background-color: red;
          font-size: 12;
        }"
      `)
      expect(result?.outputs.js.code).toMatchInlineSnapshot(`
        "import './styles.css.ts.vanilla.css';
        export var container = 'bvos4v0';"
      `)
      expect(result?.outputs.dts.code).toMatchInlineSnapshot(`
        "import './styles.css.ts.vanilla.css';
        export declare var container: string;
        "
      `)

      // Verify output paths
      expect(result?.outputs.css.path).toMatch(/\.css$/)
      expect(result?.outputs.js.path).toMatch(/\.js$/)
      expect(result?.outputs.dts.path).toMatch(/\.d\.ts$/)
    })

    test('processes complex styles with createVar and createContainer', async () => {
      const filePath = fixtures('low-level/styles.css.ts')

      const nex = createNex()
      await nex.addSource(filePath)
      const [result] = await Array.fromAsync(nex.processFiles())

      expect(result?.outputs.css.code).toMatchInlineSnapshot(`
        "._1222fxd2 {
          container-type: size;
          container-name: _1222fxd1;
          width: 500px;
        }
        ._1222fxd3 {
          --_1222fxd0: blue;
          background-color: var(--_1222fxd0);
          padding: 20px;
        }
        @media screen and (min-width: 200px) {
          @container _1222fxd1 (min-width: 400px) {
            ._1222fxd3 {
              color: white;
            }
          }
        }"
      `)
      expect(result?.outputs.js.code).toMatchInlineSnapshot(`
        "import './styles.css.ts.vanilla.css';
        export var block = '_1222fxd3';
        export var container = '_1222fxd2';"
      `)
      expect(result?.outputs.dts.code).toMatchInlineSnapshot(`
        "import './styles.css.ts.vanilla.css';
        export declare var block: string;
        export declare var container: string;
        "
      `)
    })

    test('processes files with local imports', async () => {
      const nex = createNex()
      await nex.addSource(fixtures('themed/shared.css.ts'))
      await nex.addSource(fixtures('themed/themes.css.ts'))
      await nex.addSource(fixtures('themed/styles.css.ts'))

      const results: ProcessResult[] = []
      for await (const result of nex.processFiles()) {
        results.push(result)
      }

      const result = results.find((r) => r.outputs.js.path.includes('styles'))!

      expect(result.outputs.css.code).toMatchInlineSnapshot(`
        "@font-face {
          src: local("Impact");
          font-family: "tm8ia10";
        }
        @font-face {
          src: local("Comic Sans MS");
          font-family: MyGlobalComicSans;
        }
        @property --tm8ia14 {
          syntax: "<number>";
          inherits: false;
          initial-value: 0.5;
        }
        .tm8ia11 {
          display: flex;
          flex-direction: column;
          gap: var(--_1nwt1lg4);
          padding: var(--_1nwt1lg5);
        }
        .tm8ia12 {
          z-index: 1;
          position: relative;
        }
        .tm8ia13 {
          font-family: "tm8ia10";
          background-color: var(--_1nwt1lg1, "THIS FALLBACK VALUE SHOULD NEVER BE USED");
          color: var(--_1nwt1lg2);
          border-radius: 9999px;
        }
        ._1nwt1lg6 ._1nwt1lg0 .tm8ia11 .tm8ia13 {
          font-family: MyGlobalComicSans;
          outline: 5px solid red;
        }
        body .tm8ia12:after {
          content: 'I am content';
        }
        html .tm8ia16 {
          opacity: var(--tm8ia14);
        }
        html .tm8ia17 {
          opacity: var(--tm8ia14, var(--tm8ia15, 0.25));
        }
        @media only screen and (min-width: 500px) {
          .tm8ia11 {
            border: 1px solid var(--_1nwt1lg1);
          }
          .tm8ia13 {
            padding: var(--_1nwt1lg3);
          }
        }
        @media only screen and (min-width: 1000px) {
          .tm8ia13 {
            padding: var(--_1nwt1lg4);
          }
        }"
      `)
      expect(result.outputs.js.code).toMatchInlineSnapshot(`
        "import './shared.css.ts.vanilla.css';
        import './themes.css.ts.vanilla.css';
        import './styles.css.ts.vanilla.css';
        export var button = 'tm8ia13 rlovln0 tm8ia12';
        export var container = 'tm8ia11';
        export var opacity = {'1/2':'tm8ia16','1/4':'tm8ia17'};"
      `)
      expect(result.outputs.dts.code).toMatchInlineSnapshot(`
        "import './shared.css.ts.vanilla.css';
        import './themes.css.ts.vanilla.css';
        import './styles.css.ts.vanilla.css';
        export declare var button: string;
        export declare var container: string;
        export declare var opacity: {
            '1/2': string;
            '1/4': string;
        };
        "
      `)
    })

    test('processes multiple files with glob pattern', async () => {
      const nex = createNex()
      await nex.addSource(fixtures('themed/shared.css.ts'))
      await nex.addSource(fixtures('themed/themes.css.ts'))
      await nex.addSource(fixtures('themed/styles.css.ts'))

      const results: ProcessResult[] = []
      for await (const result of nex.processFiles()) {
        results.push(result)
      }

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
