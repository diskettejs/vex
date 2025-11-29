import { vanillaExtractPlugin } from '@vanilla-extract/rollup-plugin'

export default {
  input: [
    'src/styles/themed/shared.css.ts',
    'src/styles/themed/styles.css.ts',
    'src/styles/themed/themes.css.ts',
  ],
  plugins: [vanillaExtractPlugin({ identifiers: 'short' })],
  output: {
    dir: 'dist',
    format: 'esm',
    preserveModules: true,
    preserveModulesRoot: 'src',
    assetFileNames({ name }) {
      return name?.replace(/^src\//, '') ?? ''
    },
  },
}
