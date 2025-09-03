#!/usr/bin/env node

import { type IdentifierOption } from '@vanilla-extract/integration'
import meow from 'meow'
import ts from 'typescript'
import { getTsConfigPath, readConfig } from './utils.ts'
import { Vex } from './vex.ts'

const cli = meow(
  `
	Usage
	  $ vex

	Options
    --ident, -i     CSS identifier format (short, debug)
    --css-ext       Custom CSS file extension
    --imports       Include/exclude CSS imports in JS output (default: true)
     --tsconfig     Path to a TypeScript config file
    --quiet, -q     Suppress output logging
`,
  {
    importMeta: import.meta,
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
      quiet: {
        type: 'boolean',
        default: false,
        shortFlag: 'q',
      },
      tsconfig: {
        type: 'string',
        default: 'tsconfig.json',
      },
    },
  },
)
const configPath = getTsConfigPath(cli.flags.tsconfig)
const parsed = readConfig(configPath)

const vfs = new Vex(parsed, {
  identifier: cli.flags.ident as IdentifierOption,
  cssExt: cli.flags.cssExt,
  imports: cli.flags.imports,
})

const output = vfs.emit()

let fileCount = 0
for (const [path, content] of output) {
  ts.sys.writeFile(path, content)
  if (!cli.flags.quiet) {
    console.log(`✓ ${path}`)
  }
  fileCount++
}

if (!cli.flags.quiet) {
  console.log(`\nEmitted ${fileCount} file${fileCount !== 1 ? 's' : ''}`)
}
