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

export type CellColor = 'magenta' | 'yellow' | 'blue' | 'cyan' | 'dim' | 'green' | 'red'

export interface TableCell {
  value: string
  color?: CellColor
}

export interface Table {
  headers: string[]
  rows: TableCell[][]
  footer?: {
    success: { text: string; stats?: string }
    errors?: { label: string; message: string }[]
  }
}

const colorFns: Record<CellColor, (s: string) => string> = {
  magenta: chalk.magenta,
  yellow: chalk.yellow,
  blue: chalk.blue,
  cyan: chalk.cyan,
  dim: chalk.dim,
  green: chalk.green,
  red: chalk.red,
}

export function renderTableData(table: Table): void {
  const { headers, rows, footer } = table
  const lines: string[] = []

  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i]?.value.length ?? 0)),
  )

  const headerLine = headers
    .map((h, i) => chalk.bold(h.padEnd(colWidths[i] ?? 0)))
    .join('  ')
  lines.push(headerLine)

  for (const row of rows) {
    const cells = row.map((cell, i) => {
      const padded = cell.value.padEnd(colWidths[i] ?? 0)
      return cell.color ? colorFns[cell.color](padded) : padded
    })
    lines.push(cells.join('  '))
  }

  if (footer) {
    const totalWidth = colWidths.reduce((sum, w) => sum + w, 0) + (colWidths.length - 1) * 2 + 10
    lines.push(chalk.dim('─'.repeat(totalWidth)))

    const successText = chalk.green(`✓ ${footer.success.text}`)
    const statsText = footer.success.stats ? chalk.dim(footer.success.stats) : ''
    lines.push(statsText ? `${successText}  ${statsText}` : successText)

    if (footer.errors && footer.errors.length > 0) {
      lines.push(
        chalk.red(`✗ ${footer.errors.length} error${footer.errors.length === 1 ? '' : 's'}:`),
      )
      for (const { label, message } of footer.errors) {
        lines.push(`  ${chalk.dim('•')} ${label}: ${chalk.red(message)}`)
      }
    }
  }

  console.log(lines.join('\n'))
}

const typeColors: Record<OutputRow['type'], CellColor> = {
  css: 'magenta',
  js: 'yellow',
  dts: 'blue',
}

export function renderTable(
  results: ProcessResult[],
  totalDuration: number,
  errors: FileErrorEvent[] = [],
): void {
  const outputRows: OutputRow[] = []

  for (const { outputs } of results) {
    for (const [type, output] of Object.entries(outputs)) {
      outputRows.push({
        path: rel(output.path),
        type: type as OutputRow['type'],
        size: Buffer.byteLength(output.code, 'utf-8'),
      })
    }
  }

  const totalSize = outputRows.reduce((sum, r) => sum + r.size, 0)

  const table: Table = {
    headers: ['Output', 'Type', 'Size'],
    rows: outputRows.map((row) => [
      { value: row.path },
      { value: row.type, color: typeColors[row.type] },
      { value: prettyBytes(row.size), color: 'dim' },
    ]),
    footer: {
      success: {
        text: `${outputRows.length} files`,
        stats: `${prettyBytes(totalSize)}  ${prettyMs(totalDuration)}`,
      },
      errors: errors.map(({ path: p, error }) => ({
        label: rel(p),
        message: error.message,
      })),
    },
  }

  renderTableData(table)
}

const label = (s: string, width: number) => chalk.dim(s.padEnd(width))

export type SectionItem = { key: string; value: string } | string

export interface Section {
  title: string
  items: SectionItem[]
}

export function renderSections(sections: Section[]): void {
  const lines: string[] = []

  const maxKeyLen = Math.max(
    ...sections.flatMap((s) =>
      s.items.map((i) => (typeof i === 'string' ? 0 : i.key.length)),
    ),
    10,
  )

  for (const section of sections) {
    if (lines.length > 0) lines.push('')

    lines.push(chalk.bold(section.title))
    lines.push(chalk.dim('─'.repeat(50)))

    if (section.items.length === 0) {
      lines.push(chalk.yellow('  (none)'))
    } else {
      for (const item of section.items) {
        if (typeof item === 'string') {
          lines.push(`  ${chalk.dim('•')} ${item}`)
        } else {
          lines.push(`${label(item.key, maxKeyLen + 2)} ${chalk.cyan(item.value)}`)
        }
      }
    }
  }

  console.log(lines.join('\n'))
}
const enumMapping: Record<string, Record<number, string>> = {
  target: ts.ScriptTarget,
  module: ts.ModuleKind,
  moduleResolution: ts.ModuleResolutionKind,
  jsx: ts.JsxEmit,
  newLine: ts.NewLineKind,
  moduleDetection: ts.ModuleDetectionKind,
}

function formatCompilerOptionValue(key: string, value: unknown): string {
  if (typeof value === 'number' && enumMapping[key]) {
    return enumMapping[key][value] ?? String(value)
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

export function renderDebugInfo(config: {
  namespace: string
  args: Record<string, any>
  compilerOptions: ts.CompilerOptions
  matchedFiles: string[]
}): void {
  const configItems: SectionItem[] = [
    { key: 'Namespace', value: config.namespace },
    { key: 'Output Dir', value: config.args.output },
  ]

  if (config.args.tsconfig || config.args.tsconfigPath) {
    configItems.push({
      key: 'TSConfig',
      value: config.args.tsconfig ?? config.args.tsconfigPath,
    })
  }

  configItems.push(
    { key: 'Dry Run', value: String(config.args['dry-run'] ?? false) },
    { key: 'Quiet', value: String(config.args.quiet ?? false) },
    { key: 'Log Level', value: config.args['log-level'] },
  )

  const compilerItems: SectionItem[] = Object.entries(config.compilerOptions)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({
      key,
      value: formatCompilerOptionValue(key, value),
    }))

  const sections: Section[] = [
    { title: 'Configuration', items: configItems },
    { title: 'Compiler Options', items: compilerItems },
    {
      title: `Input Files (${config.matchedFiles.length})`,
      items: config.matchedFiles.map((f) => rel(f)),
    },
  ]

  renderSections(sections)
}
