import chalk from 'chalk'
import path from 'node:path'
import type { ProcessResult } from './types.ts'

const rel = (p: string) => path.relative(process.cwd(), p)

const cmd = (s: string) => chalk.cyan(`$ ${s}`)
const dim = chalk.grey

export const examples = `
${chalk.bold('Examples:')}

  ${dim('Process all .css.ts files in src/ and output to dist/')}
    ${cmd('nex "src/**/*.css.ts"')}

  ${dim('Use a custom output directory')}
    ${cmd('nex "src/**/*.css.ts" --output build')}

  ${dim('Preview what would be processed without writing files')}
    ${cmd('nex "src/**/*.css.ts" --dry-run')}

  ${dim('Use a specific tsconfig')}
    ${cmd('nex "src/**/*.css.ts" --tsconfig tsconfig.build.json')}

  ${dim('Combine options')}
    ${cmd('nex "src/components/**/*.css.ts" -o dist/css -n')}
`

export const helpFooter = `
For more information, visit: ${chalk.underline('https://github.com/user/nex')}
`

export function formatOutputs(results: ProcessResult[]): string {
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
    `${chalk.bold('nex')} ${chalk.dim('- vanilla-extract CSS processor')}\n`,
  )
  console.log(
    `${chalk.bold('Usage:')} nex ${chalk.cyan('<patterns...>')} ${chalk.dim('[options]')}`,
  )
  console.log(examples)
  console.log(chalk.dim('Run nex --help for all options.'))
}
