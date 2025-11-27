import * as esbuild from 'esbuild'
import { getSourceFiles } from './dts.ts'
import { pkgInfo } from './misc.ts'
import { Nex } from './nex.ts'

const pkg = await pkgInfo()

const nex = new Nex({ pkg })

const sourceFiles = await getSourceFiles('**/*.css.ts')

const transformed = sourceFiles.map((file) => ({
  file,
  code: esbuild.transformSync(file.text, {
    loader: 'ts',
    format: 'cjs',
  }).code,
}))

const sourceFile = transformed.find((f) =>
  f.file.fileName.includes('themed/styles.css.ts'),
)!

const result = nex.process(sourceFile.file.fileName, sourceFile.code)

console.log({ js: result.js })
for (const [file, css] of result.css) {
  console.log({ file, imports: Array.from(css.imports) })
}
