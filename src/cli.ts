#!/usr/bin/env node

import { disk } from '@diskette/fs/node'
import type { IdentifierOption } from '@vanilla-extract/integration'
import meow from 'meow'
import { VanillaVfs } from './vanilla-vfs.ts'

const cli = meow(
  `
	Usage
	  $ tsc-ve

	Options
    --ident, -i  Identifiers format
    --css-ext
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
    },
  },
)

const vfs = new VanillaVfs({
  identifier: cli.flags.ident as IdentifierOption,
  cssExt: cli.flags.cssExt,
})

const files = vfs.compile()
const promises = []
for (const [path, content] of files) {
  console.log(path, content)
  promises.push(disk.write(path, content))
}

await Promise.all(promises)
console.log(`persisted ${files.size} files`)
