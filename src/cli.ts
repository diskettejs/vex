#!/usr/bin/env node

import type { IdentifierOption } from '@vanilla-extract/integration'
import meow from 'meow'
import { getTsConfigPath } from './utils.ts'
import { Vex } from './vex.ts'

const cli = meow(
  `
	Usage
	  $ vex

	Options
    --ident, -i  Identifiers format
    --css-ext
    --imports
    --watch, -w  Watch for file changes
`,
  {
    importMeta: import.meta,
    // TODO: add a `noCheck` flag
    flags: {
      ident: {
        choices: ['short', 'debug'],
        default: 'short',
        type: 'string',
      },
      cssExt: {
        type: 'string',
      },
      imports: {
        type: 'boolean',
        default: true,
      },
      tsconfig: {
        type: 'string',
      },
      watch: {
        type: 'boolean',
        default: false,
        shortFlag: 'w',
      },
      typeCheck: {
        type: 'boolean',
        default: true,
      },
    },
  },
)

const vex = new Vex({
  identifier: cli.flags.ident as IdentifierOption,
  cssExt: cli.flags.cssExt,
  imports: cli.flags.imports,
  configPath: getTsConfigPath(cli.flags.tsconfig),
})

if (cli.flags.watch) {
  console.log('Starting watch mode...')
  // Disabling type-checking for now, need to figure out the `getSourceFile` equivalent for `createWatchCompilerHost`
  // As files are getting procssed during `readFile`, breaking type generation
  const watcher = vex.watch({ noCheck: true })

  process.on('SIGINT', () => watcher.close())
  process.on('SIGTERM', () => watcher.close())
} else {
  vex.compile({ noCheck: !cli.flags.typeCheck })
}
