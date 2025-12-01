#!/usr/bin/env node

import { defineCommand, runMain } from 'citty'
import { formatOutputs, renderUsage } from './copy.ts'
import { pkgInfo, writeOutput } from './misc.ts'
import type { ProcessResult } from './types.ts'
import { Vex } from './vex.ts'

const pkg = await pkgInfo()

const main = defineCommand({
  meta: {
    name: 'vex',
    version: pkg.version ?? '0.0.0',
    description: pkg.description ?? '',
  },
  args: {
    files: {
      type: 'positional',
      description: 'Glob pattern matching .css.ts files to process',
      valueHint: 'src/**/*.css.ts',
      default: '**/**.css.ts',
    },
    output: {
      type: 'string',
      alias: 'o',
      description: 'Directory for compiled CSS, JS, and .d.ts output',
      default: 'dist',
      valueHint: 'dist',
    },
    tsconfig: {
      type: 'string',
      description: 'Path to tsconfig.json for TypeScript resolution',
      default: 'tsconfig.json',
      valueHint: 'tsconfig.build.json',
    },
    'dry-run': {
      type: 'boolean',
      alias: 'n',
      description: 'Process files without writing output',
    },
    quiet: {
      type: 'boolean',
      alias: 'q',
      description: 'Suppress non-error output',
    },
  },

  async run({ args }) {
    if (args._.length === 0) {
      renderUsage()
      return
    }

    const nex = new Vex({
      tsconfig: args.tsconfig,
      pkgInfo: pkg,
      compilerOptions: { outDir: args.output },
    })

    await Promise.all(args._.map((file) => nex.addSource(file)))

    const results: ProcessResult[] = []

    for await (const result of nex.processFiles()) {
      if (!args['dry-run']) {
        await Promise.all(
          Object.values(result.outputs).map((output) => writeOutput(output)),
        )
      }
      results.push(result)
    }

    if (!args.quiet) {
      console.log()
      console.log(formatOutputs(results))
    }
  },
})

runMain(main)
