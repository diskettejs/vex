#!/usr/bin/env tsx

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

const packagePath = process.argv[2] ?? 'packages/vex'
const packageDir = join(rootDir, packagePath)

const pkg = JSON.parse(
  readFileSync(join(packageDir, 'package.json'), 'utf-8'),
)

const cliPath = join(packageDir, 'dist/cli.js')
const cli = readFileSync(cliPath, 'utf-8')
  .replace(/__VERSION__/g, pkg.version)
  .replace(/__DESC__/g, pkg.description)

writeFileSync(cliPath, cli)

console.log(`Injected meta into ${packagePath}/dist/cli.js`)
console.log(`  version: ${pkg.version}`)
console.log(`  description: ${pkg.description}`)
