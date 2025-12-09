#!/usr/bin/env node

import { subscribe } from '@parcel/watcher'
import { Repeater, SlidingBuffer } from '@repeaterjs/repeater'
import { defineCommand, runMain } from 'citty'
import { basename, relative, resolve } from 'node:path'
import {
  renderDebugInfo,
  renderRebuild,
  renderTable,
  renderUsage,
} from './copy.ts'
import { createLogger } from './logger.ts'
import { looksLikeDirectory, tsFileFilter, writeResults } from './misc.ts'
import {
  buildVexCompilerOptions,
  findTsConfig,
  getPackageJson,
} from './pkg-utils.ts'
import type { FileErrorEvent, VexOptions } from './types.ts'

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
    watch: {
      type: 'boolean',
      alias: 'w',
      description: 'Watch for file changes and recompile',
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

    const vexOptions: VexOptions = {
      namespace,
      sources: source,
      compilerOptions: buildVexCompilerOptions({
        ...compilerOptions,
        rootDir: source ? resolve(cwd, source) : undefined,
        outDir: resolve(cwd, args.output),
      }),
    }
    const { Vex } = await import('./vex.ts')
    const vex = new Vex(vexOptions)
    const logger = createLogger(args)

    if (args.debug) {
      renderDebugInfo({
        namespace,
        args: { ...args, tsconfigPath },
        compilerOptions: vex.compilerOptions,
        matchedFiles: vex.files,
      })
      return
    }

    logger.update('Discovering files...')

    let watchErrors: FileErrorEvent[] = []

    for await (const event of vex.process()) {
      switch (event.type) {
        case 'transpile': {
          const displayPath = relative(cwd, event.file.path)
          logger.update(
            `[${event.file.index + 1}/${event.file.total}] Transpiling: ${displayPath}`,
          )
          break
        }

        case 'start': {
          const displayPath = relative(cwd, event.file.path)
          logger.update(
            `[${event.file.index + 1}/${event.file.total}] Processing: ${displayPath}`,
          )
          break
        }

        case 'complete':
          if (!args['dry-run']) {
            await writeResults(event.result)
          }
          break

        case 'done':
          watchErrors = event.errors
          logger.clear()
          logger.render(() => {
            if (args.watch) {
              renderRebuild(event.results, event.totalDuration, event.errors)
            } else {
              renderTable(event.results, event.totalDuration, event.errors)
            }
          })

          if (!args.watch && event.errors.length > 0) {
            process.exit(1)
          }
          break
      }
    }

    if (args.watch) {
      if (!source) {
        console.error('Error: --watch requires a source directory')
        process.exit(1)
      }

      const sourceDir = resolve(cwd, source)

      const watcher = new Repeater<string>(async (push, stop) => {
        const subscription = await subscribe(
          sourceDir,
          (err, events) => {
            if (err) {
              stop(err)
              return
            }

            for (const e of events) {
              if (e.type !== 'delete' && tsFileFilter.test(e.path)) {
                push(e.path)
              }
            }
          },
          { ignore: ['**/node_modules/**', '**/.git/**'] },
        )

        await stop
        await subscription.unsubscribe()
      }, new SlidingBuffer(50))

      process.on('SIGINT', () => watcher.return())
      process.on('SIGTERM', () => watcher.return())

      logger.log('\nWatching for changes...')

      for await (const changedPath of watcher) {
        const startTime = performance.now()
        const displayPath = relative(cwd, changedPath)
        logger.update(`Rebuilding: ${displayPath}`)

        try {
          const results = vex.update(changedPath)

          if (results.length === 0) {
            continue
          }

          if (!args['dry-run']) {
            for (const result of results) {
              await writeResults(result)
            }
          }

          const duration = performance.now() - startTime
          watchErrors = []

          logger.render(() => renderRebuild(results, duration))
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err))
          watchErrors = [{ path: changedPath, index: 0, total: 1, error }]

          logger.render(() =>
            renderRebuild([], performance.now() - startTime, watchErrors),
          )
        }
      }

      process.exit(watchErrors.length > 0 ? 1 : 0)
    }
  },
})

runMain(main)
