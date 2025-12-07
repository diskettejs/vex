#!/usr/bin/env node

import { defineCommand, runMain } from 'citty'
import logUpdate from 'log-update'
import { basename, relative, resolve } from 'node:path'
import { renderDebugInfo, renderTable, renderUsage } from './copy.ts'
import { looksLikeDirectory, writeOutput } from './misc.ts'
import {
  buildVexCompilerOptions,
  findTsConfig,
  getPackageJson,
} from './pkg-utils.ts'
import type { FileErrorEvent, ProcessResult } from './types.ts'

const main = defineCommand({
  meta: {
    name: 'vex',
    version: '__VERSION__',
    description: '__DESC__',
  },
  args: {
    source: {
      type: 'positional',
      description: 'Source directory containing .css.ts files',
      valueHint: 'src',
      required: true,
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
      alias: 'p',
      description: 'Path to tsconfig.json for TypeScript resolution',
      valueHint: 'tsconfig.build.json',
    },
    namespace: {
      type: 'string',
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

  async run({ args, rawArgs }) {
    const source = rawArgs[0]
    if (!source && !args.debug) {
      renderUsage()
      return
    }

    if (source && !looksLikeDirectory(source)) {
      console.error(
        `Error: Expected a directory, got file path "${source}"\n` +
          `Usage: vex <directory> [-o output]`,
      )
      process.exit(1)
    }

    const cwd = process.cwd()
    const pkg = getPackageJson(cwd)
    const namespace = args.namespace ?? pkg?.name ?? basename(cwd)

    const { compilerOptions, tsconfigPath } =
      findTsConfig({ searchPath: args.tsconfig }) ?? {}

    const { Vex } = await import('./vex.ts')

    const vex = new Vex({
      namespace,
      sources: source,
      compilerOptions: buildVexCompilerOptions({
        ...compilerOptions,
        rootDir: source ? resolve(cwd, source) : undefined,
        outDir: resolve(cwd, args.output),
      }),
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

    if (!args.quiet) {
      logUpdate('Discovering files...')
    }

    const success: ProcessResult[] = []
    const errors: FileErrorEvent[] = []
    let totalDuration = 0

    for await (const event of vex.process()) {
      switch (event.type) {
        case 'transform':
          if (!args.quiet) {
            const displayPath = relative(cwd, event.file.path)
            logUpdate(
              `[${event.file.index + 1}/${event.file.total}] Transforming: ${displayPath}`,
            )
          }
          break

        case 'start':
          if (!args.quiet) {
            const displayPath = relative(cwd, event.file.path)
            logUpdate(
              `[${event.file.index + 1}/${event.file.total}] Processing: ${displayPath}`,
            )
          }
          break

        case 'complete':
          success.push(event.result)
          if (!args['dry-run']) {
            await Promise.all(
              Object.values(event.result.outputs).map((output) =>
                writeOutput(output),
              ),
            )
          }
          break

        case 'error':
          errors.push({ ...event.file, error: event.error })
          break

        case 'done':
          totalDuration = event.totalDuration
          break
      }
    }

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
