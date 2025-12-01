import chalk from 'chalk'
import path from 'node:path'
import { prettyBytes, prettyMs } from './misc.ts'
import type { ProcessResult } from './types.ts'

const rel = (p: string) => path.relative(process.cwd(), p)

const cmd = (s: string) => chalk.cyan(`$ ${s}`)
const dim = chalk.grey

export const examples = `
${chalk.bold('Examples:')}

  ${dim('Process all .css.ts files in src/ and output to dist/')}
    ${cmd('vex "src"')}

  ${dim('Use a custom output directory')}
    ${cmd('vex "src" --output build')}

  ${dim('Preview what would be processed without writing files')}
    ${cmd('vex "src" --dry-run')}

  ${dim('Use a specific tsconfig')}
    ${cmd('vex "src" --tsconfig tsconfig.build.json')}

  ${dim('Combine options')}
    ${cmd('vex "src/components" -o dist/css -n')}
`

export function formatOutputs(
  results: ProcessResult[],
  totalDuration: number,
): string {
  const lines: string[] = []
  const arrow = chalk.dim('→')

  for (const { source, outputs } of results) {
    lines.push(chalk.bold(rel(source)))
    lines.push(`  ${arrow} ${chalk.magenta(rel(outputs.css.path))}`)
    lines.push(`  ${arrow} ${chalk.yellow(rel(outputs.js.path))}`)
    lines.push(`  ${arrow} ${chalk.blue(rel(outputs.dts.path))}`)
    lines.push('')
  }

  const totalOutputs = results.length * 3
  lines.push(
    chalk.green(
      `${results.length} source${results.length === 1 ? '' : 's'} → ${totalOutputs} files`,
    ),
  )

  return lines.join('\n')
}

export function renderUsage() {
  console.log(
    `${chalk.bold('vex')} ${chalk.dim('- vanilla-extract CSS processor')}\n`,
  )
  console.log(
    `${chalk.bold('Usage:')} vex ${chalk.cyan('<patterns...>')} ${chalk.dim('[options]')}`,
  )
  console.log(examples)
  console.log(chalk.dim('Run vex --help for all options.'))
}

interface OutputRow {
  path: string
  type: 'css' | 'js' | 'dts'
  size: number
}

export function formatOutputsTable(
  results: ProcessResult[],
  totalDuration: number,
): string {
  const rows: OutputRow[] = []

  for (const { outputs } of results) {
    for (const [type, output] of Object.entries(outputs)) {
      rows.push({
        path: rel(output.path),
        type: type as OutputRow['type'],
        size: Buffer.byteLength(output.code, 'utf-8'),
      })
    }
  }

  const maxPathLen = Math.max(...rows.map((r) => r.path.length), 6)
  const maxTypeLen = 4

  const lines: string[] = []

  const header = `${chalk.bold('Output'.padEnd(maxPathLen))}  ${chalk.bold('Type'.padEnd(maxTypeLen))}  ${chalk.bold('Size')}`
  lines.push(header)

  for (const row of rows) {
    const typeColor =
      row.type === 'css'
        ? chalk.magenta
        : row.type === 'js'
          ? chalk.yellow
          : chalk.blue
    const pathStr = row.path.padEnd(maxPathLen)
    const typeStr = typeColor(row.type.padEnd(maxTypeLen))
    const sizeStr = chalk.dim(prettyBytes(row.size))
    lines.push(`${pathStr}  ${typeStr}  ${sizeStr}`)
  }

  const totalSize = rows.reduce((sum, r) => sum + r.size, 0)
  lines.push(chalk.dim('─'.repeat(maxPathLen + maxTypeLen + 16)))
  lines.push(
    chalk.green(`${rows.length} files`.padEnd(maxPathLen + maxTypeLen + 4)) +
      chalk.dim(`${prettyBytes(totalSize)}  ${prettyMs(totalDuration)}`),
  )

  return lines.join('\n')
}

// TODO: add error copy
/**
 * Potential errors
 * - Vex#addSource: `File not found: /path/to/file.ts`
 */
