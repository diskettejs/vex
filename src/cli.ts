#!/usr/bin/env node

import type { IdentifierOption } from '@vanilla-extract/integration'
import meow from 'meow'
import { basename } from 'node:path'
import invariant from 'tiny-invariant'
import ts from 'typescript'
import { readConfig } from './utils.ts'
import { VanillaExtract } from './vanilla-extract.ts'

const cli = meow(
  `
	Usage
	  $ vex

	Options
    --ident, -i  Identifiers format
    --css-ext
    --imports
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
        default: false,
      },
      tsconfig: {
        type: 'string',
      },
    },
  },
)

let config
if (cli.flags.tsconfig) {
  const configFile = ts.findConfigFile(
    ts.sys.resolvePath(cli.flags.tsconfig),
    ts.sys.fileExists,
    basename(cli.flags.tsconfig),
  )
  invariant(configFile, `Could not find config: ${cli.flags.tsconfig}`)
  config = readConfig(configFile)
}

const vex = new VanillaExtract(
  {
    identifier: cli.flags.ident as IdentifierOption,
    cssExt: cli.flags.cssExt,
    imports: cli.flags.imports,
  },
  config,
)

const files = vex.compile()

for (const [path, content] of files) {
  ts.sys.writeFile(path, content)
}
