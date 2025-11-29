import { pkgInfo } from './misc.ts'
import { Nex } from './nex.ts'

const pkg = await pkgInfo()
const nex = new Nex({ pkg })

for await (const result of nex.processFiles('tests/fixtures/**/**.css.ts')) {
}
