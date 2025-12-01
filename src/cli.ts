#!/usr/bin/env node

import { defineCommand, runMain } from 'citty'
import logUpdate from 'log-update'
import { basename, relative } from 'node:path'
import { formatOutputs, formatOutputsTable, renderUsage } from './copy.ts'
import { pkgInfo, writeOutput } from './misc.ts'
import { Vex } from './vex.ts'

const pkg = await pkgInfo().catch(() => null)

const main = defineCommand({
  meta: {
    name: 'vex',
    version: pkg?.version ?? '0.0.0',
    description: pkg?.description ?? '',
  },
  args: {
    files: {
      type: 'positional',
      description: 'Directory containing .css.ts files to process',
      valueHint: 'src',
      default: '**/**.css.ts',
    },
    output: {
      type: 'string',
      alias: 'o',
      description: 'Output directory for compiled CSS, JS, and .d.ts',
      default: 'dist',
      valueHint: 'dist',
    },
    tsconfig: {
      type: 'string',
      description: 'Path to tsconfig.json for TypeScript resolution',
      valueHint: 'tsconfig.build.json',
    },
    namespace: {
      type: 'string',
      alias: 'p',
      description:
        'Namespace for CSS scoping (defaults to package.json name or directory)',
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
    'log-level': {
      type: 'string',
      alias: 'l',
      description:
        'Output verbosity: normal (table) or verbose (detailed paths)',
      default: 'normal',
    },
  },

  async run({ args }) {
    if (args._.length === 0) {
      renderUsage()
      return
    }

    const cwd = process.cwd()
    const namespace = args.namespace ?? pkg?.name ?? basename(cwd)

    const vex = new Vex({
      namespace,
      tsconfig: args.tsconfig,
      compilerOptions: { outDir: args.output },
    })

    args._.map((file) => vex.addSource(file))

    const { results, errors, totalDuration } = await vex.processFiles({
      onFileStart({ path, index, total }) {
        if (!args.quiet) {
          const displayPath = relative(cwd, path)
          logUpdate(`[${index + 1}/${total}] Processing: ${displayPath}`)
        }
      },

      async onFileComplete({ result }) {
        if (!args['dry-run']) {
          await Promise.all(
            Object.values(result.outputs).map((output) => writeOutput(output)),
          )
        }
      },

      onError: ({ path, error }) => {
        const displayPath = relative(cwd, path)
        console.error(`Error processing ${displayPath}: ${error.message}`)
      },
    })

    if (!args.quiet) {
      logUpdate.clear()
      const formatter =
        args['log-level'] === 'verbose' ? formatOutputs : formatOutputsTable
      console.log(formatter(results, totalDuration))
    }

    if (errors.length > 0) {
      process.exit(1)
    }
  },
})

runMain(main)
