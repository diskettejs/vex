#!/usr/bin/env node

import { defineCommand, runMain } from 'citty'
import logUpdate from 'log-update'
import { basename, relative } from 'node:path'
import { renderDebugInfo, renderTable, renderUsage } from './copy.ts'
import { writeOutput } from './misc.ts'
import {
  buildVexCompilerOptions,
  findTsConfig,
  getPackageJson,
} from './pkg-utils.ts'

const main = defineCommand({
  meta: {
    name: 'vex',
    version: '__VERSION__',
    description: '__DESC__',
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
    debug: {
      type: 'boolean',
      alias: 'd',
      description: 'Show configuration and matched files before processing',
    },
  },

  async run({ args }) {
    if (args._.length === 0 && !args.debug) {
      renderUsage()
      return
    }

    const cwd = process.cwd()
    const pkg = getPackageJson(cwd)
    const namespace = args.namespace ?? pkg?.name ?? basename(cwd)

    const { compilerOptions, tsconfigPath } =
      findTsConfig({ searchPath: args.tsconfig }) ?? {}

    const { Vex } = await import('./vex.ts')

    const vex = new Vex({
      namespace,
      sources: args._,
      compilerOptions: buildVexCompilerOptions(args.output, compilerOptions),
    })

    if (args.debug) {
      renderDebugInfo({
        namespace,
        args: { ...args, tsconfigPath },
        compilerOptions: vex.compilerOptions,
        matchedFiles: vex.files,
      })
      return
    }

    logUpdate('Discovering files...')

    const { stream, results } = vex.process()

    for (const event of stream) {
      switch (event.type) {
        case 'start':
          if (!args.quiet) {
            const displayPath = relative(cwd, event.file.path)
            logUpdate(
              `[${event.file.index + 1}/${event.file.total}] Processing: ${displayPath}`,
            )
          }
          break

        case 'complete':
          if (!args['dry-run']) {
            await Promise.all(
              Object.values(event.result.outputs).map((output) =>
                writeOutput(output),
              ),
            )
          }
          break
      }
    }

    const { success, errors, totalDuration } = await results

    if (!args.quiet) {
      logUpdate.clear()
      renderTable(success, totalDuration, errors)
    }

    if (errors.length > 0) {
      process.exit(1)
    }
  },
})

runMain(main)
