import chalk from 'chalk'
import path from 'node:path'
import { ts } from 'ts-morph'
import { prettyBytes, prettyMs } from './misc.ts'
import type { FileErrorEvent, ProcessResult } from './types.ts'

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

export function renderUsage(): void {
  console.log(
    `${chalk.bold('vex')} ${chalk.dim('- vanilla-extract CSS processor')}\n`,
  )
  console.log(
    `${chalk.bold('Usage:')} vex ${chalk.cyan('<patterns...>')} ${chalk.dim('[options]')}`,
  )
  console.log(examples)
  console.log(chalk.dim('Run vex --help for all options.'))
}

export interface OutputRow {
  path: string
  type: 'css' | 'js' | 'dts'
  size: number
}

export function renderTable(
  results: ProcessResult[],
  totalDuration: number,
  errors: FileErrorEvent[] = [],
): void {
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

  const successLine =
    chalk.green(`✓ ${rows.length} files`.padEnd(maxPathLen + maxTypeLen + 4)) +
    chalk.dim(`${prettyBytes(totalSize)}  ${prettyMs(totalDuration)}`)
  lines.push(successLine)

  if (errors.length > 0) {
    lines.push(
      chalk.red(`✗ ${errors.length} error${errors.length === 1 ? '' : 's'}:`),
    )
    for (const { path, error } of errors) {
      lines.push(
        `  ${chalk.dim('•')} ${rel(path)}: ${chalk.red(error.message)}`,
      )
    }
  }

  console.log(lines.join('\n'))
}

const label = (s: string) => chalk.dim(s.padEnd(20))
const enumMapping: Record<string, Record<number, string>> = {
  target: ts.ScriptTarget,
  module: ts.ModuleKind,
  moduleResolution: ts.ModuleResolutionKind,
  jsx: ts.JsxEmit,
  newLine: ts.NewLineKind,
  moduleDetection: ts.ModuleDetectionKind,
}

export function renderDebugInfo(config: {
  namespace: string
  args: Record<string, any>
  compilerOptions: ts.CompilerOptions
  matchedFiles: string[]
}): void {
  const lines: string[] = []

  lines.push(chalk.bold('Configuration'))
  lines.push(chalk.dim('─'.repeat(50)))
  lines.push(`${label('Namespace')} ${chalk.cyan(config.namespace)}`)
  lines.push(`${label('Output Dir')} ${chalk.cyan(config.args.output)}`)
  if (config.args.tsconfig || config.args.tsconfigPath) {
    lines.push(
      `${label('TSConfig')} ${chalk.cyan(config.args.tsconfig ?? config.args.tsconfigPath)}`,
    )
  }
  lines.push(
    `${label('Dry Run')} ${chalk.cyan(config.args['dry-run'] ?? false)}`,
  )
  lines.push(`${label('Quiet')} ${chalk.cyan(config.args.quiet ?? false)}`)
  lines.push(`${label('Log Level')} ${chalk.cyan(config.args['log-level'])}`)
  lines.push('')

  lines.push(chalk.bold('Compiler Options'))
  lines.push(chalk.dim('─'.repeat(50)))

  const opts = config.compilerOptions

  for (const [key, value] of Object.entries(opts)) {
    if (value === undefined) continue

    let formattedValue: string
    if (typeof value === 'number' && enumMapping[key]) {
      formattedValue = enumMapping[key][value] ?? String(value)
    } else if (typeof value === 'object') {
      formattedValue = JSON.stringify(value)
    } else {
      formattedValue = String(value)
    }

    lines.push(`${label(key)} ${chalk.cyan(formattedValue)}`)
  }

  lines.push('')

  const fileCount = config.matchedFiles.length
  lines.push(chalk.bold(`Input Files (${fileCount})`))
  lines.push(chalk.dim('─'.repeat(50)))

  if (fileCount === 0) {
    lines.push(chalk.yellow('  No files matched'))
  } else {
    for (const file of config.matchedFiles) {
      lines.push(`  ${chalk.dim('•')} ${rel(file)}`)
    }
  }

  console.log(lines.join('\n'))
}
