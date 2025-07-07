# @diskette/vex

A TypeScript-first build tool for [@vanilla-extract](https://vanilla-extract.style/) that leverages your existing `tsconfig.json` configuration.

## Installation

Note: `@vanilla-extract/css` is a peer dependency and must be installed.

```bash
npm install @diskette/vex
# or
pnpm add @diskette/vex
```

## CLI Usage

`vex` automatically discovers and compiles all vanilla-extract files (`.css.ts` and `.css.js`) in your TypeScript project:

```bash
npx vex
```

### CLI Options

| Option       | Alias | Type      | Default   | Description                                          |
| ------------ | ----- | --------- | --------- | ---------------------------------------------------- |
| `--ident`    | `-i`  | `string`  | `"short"` | CSS class identifier format (`"short"` or `"debug"`) |
| `--css-ext`  |       | `string`  |           | Custom CSS file extension (e.g., `.module.css`)      |
| `--imports`  |       | `boolean` | `false`   | Generate CSS import statements in output files       |
| `--tsconfig` |       | `string`  |           | Path to TypeScript config file                       |

### Examples

```bash
# Basic compilation
vex

# Use debug identifiers for development
vex --ident debug

# Custom CSS file extension
vex --css-ext .module.css

# Include CSS imports in output
vex --imports

# Use specific tsconfig file
vex --tsconfig ./tsconfig.build.json

# Combine options
vex --ident debug --imports --css-ext .styles.css
```

## TypeScript Integration

`vex` automatically reads your `tsconfig.json` configuration and respects:

- **File inclusion/exclusion patterns** - Only processes vanilla-extract files that match your TypeScript project settings
- **Compiler options** - Uses your existing TypeScript configuration for compilation
- **Path mapping** - Supports TypeScript path aliases and baseUrl
- **Output directory** - Follows your `outDir` setting

### Project Structure Example

```
src/
├── components/
│   ├── Button.css.ts      # vanilla-extract styles
│   ├── Button.tsx         # React component
│   └── Card.css.ts        # vanilla-extract styles
├── theme/
│   └── vars.css.ts        # CSS variables
└── tsconfig.json
```

After running `vex`:

```
dist/                      # Based on your tsconfig outDir
├── components/
│   ├── Button.css.js      # Compiled JavaScript
│   ├── Button.ts.vanilla.css  # Generated CSS
│   ├── Button.js          # Your component
│   ├── Card.css.js
│   └── Card.ts.vanilla.css
└── theme/
    ├── vars.css.js
    └── vars.ts.vanilla.css
```

## Programmatic Usage

You can also use `VanillaExtract` programmatically in your build scripts:

```typescript
import { VanillaExtract } from '@diskette/vex'

// Use default tsconfig.json
const vex = new VanillaExtract({
  identifier: 'debug',
  cssExt: '.module.css',
  imports: true,
})

// Or provide custom TypeScript config
import { readConfig } from '@diskette/vex/utils'
const tsConfig = readConfig('./tsconfig.build.json')
const vex = new VanillaExtract(
  {
    identifier: 'short',
    imports: false,
  },
  tsConfig,
)

// Compile and get file contents
const files = vex.compile()

// files is a Map<string, string> of file paths to content
for (const [filePath, content] of files) {
  console.log(`Generated: ${filePath}`)
  // Write files or process further...
}
```

### VanillaExtract Options

```typescript
interface VanillaOptions {
  identifier?: 'short' | 'debug' // CSS class name format
  cssExt?: string // Custom CSS file extension
  imports?: boolean // Include CSS imports in JS output
}
```

## CSS Import Generation

When `--imports` is enabled, `vex` automatically generates CSS import statements:

**Input** (`Button.css.ts`):

```typescript
import { style } from '@vanilla-extract/css'
import './theme.css.ts' // Imports theme variables

export const button = style({
  padding: '8px 16px',
  borderRadius: '4px',
})
```

**Output** (`Button.css.js`):

```javascript
import './theme.ts.vanilla.css' // Auto-generated CSS import

export const button = '_button_1a2b3c'
```

This ensures CSS dependencies are properly loaded when using the compiled JavaScript.

## Identifier Formats

- **`short`** (default): Generates minified class names like `_button_1a2b3c`
- **`debug`**: Generates readable class names like `Button_button_1a2b3c` for easier debugging

## License

MIT
