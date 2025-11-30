import { defineCommand, runMain } from 'citty'
import { pkgInfo, writeOutput } from './misc.ts'
import { Nex } from './nex.ts'

const pkg = await pkgInfo()

const main = defineCommand({
  meta: {
    name: 'nex',
    version: pkg.version ?? '0.0.0',
    description: pkg.description ?? '',
  },
  args: {
    files: {
      type: 'positional',
      description: 'Path to directory of files or glob path',
      valueHint: '**/**.css.ts',
      default: '**/**.css.ts',
    },
    output: {
      type: 'string',
      alias: 'o',
      description: 'Output dir',
      default: 'dist',
    },
    tsconfig: {
      type: 'string',
      alias: 'p',
      description: 'tsconfig path',
      default: 'tsconfig.json',
    },
    dry: {
      type: 'boolean',
    },
  },

  async run({ args }) {
    const nex = new Nex({
      tsconfig: args.tsconfig,
      pkgInfo: pkg,
      compilerOptions: { outDir: args.output },
    })

    for await (const result of nex.processFiles(args._)) {
      if (!args.dry) {
        await Promise.all(
          Object.values(result.outputs).map((output) => writeOutput(output)),
        )
      }
    }
  },
})

runMain(main)
