# @diskette/vex

Compiles [vanilla-extract](https://vanilla-extract.style/) `.css.ts` files into CSS, JavaScript, and TypeScript declarations.

## Installation

```bash
npm install @diskette/vex
# or
pnpm add @diskette/vex
```

**Peer dependency:** Requires `@vanilla-extract/css`

```bash
npm install @vanilla-extract/css
```

## CLI Usage

```bash
vex <patterns...> [options]
```

### Examples

```bash
# Process all .css.ts files in src/ and output to dist/
vex "src"

# Use a custom output directory
vex "src" --output build

# Preview what would be processed without writing files
vex "src" --dry-run

# Use a specific tsconfig
vex "src" --tsconfig tsconfig.build.json

# Combine options
vex "src/components" -o dist/css -n
```

### Options

| Option                  | Alias | Description                                                      | Default |
| ----------------------- | ----- | ---------------------------------------------------------------- | ------- |
| `--output <dir>`        | `-o`  | Directory for compiled CSS, JS, and .d.ts output                 | `dist`  |
| `--namespace <name>`    | `-p`  | Namespace for CSS scoping                                        | \*      |
| `--tsconfig <path>`     |       | Path to tsconfig.json for TypeScript resolution                  |         |
| `--dry-run`             | `-n`  | Process files without writing output                             |         |
| `--quiet`               | `-q`  | Suppress non-error output                                        |         |
| `--log-level <level>`   | `-l`  | Output verbosity: `normal` (table) or `verbose` (detailed paths) | `normal`|
| `--debug`               | `-d`  | Show configuration and matched files before processing           |         |

\* Defaults to `name` in package.json, or the current directory name

## Output

For each `.css.ts` source file, Vex generates three files:

- **`.css`** - Compiled CSS
- **`.js`** - JavaScript module with exported class names and style references
- **`.d.ts`** - TypeScript declarations

### Example

```bash
vex "src" -o dist
```

```
src/                          dist/
├── components/               ├── components/
│   ├── button.css.ts    →    │   ├── button.css
│   │                         │   ├── button.js
│   │                         │   ├── button.d.ts
│   │                         │   │
│   └── card.css.ts      →    │   ├── card.css
│                             │   ├── card.js
│                             │   └── card.d.ts
│                             │
└── theme.css.ts         →    ├── theme.css
                              ├── theme.js
                              └── theme.d.ts
```

## Programmatic API

```typescript
import { Vex } from '@diskette/vex'

const vex = new Vex({
  tsconfig: 'tsconfig.json',
  compilerOptions: { outDir: 'dist' },
})

await vex.addSource('src/styles.css.ts')

const { results, errors, totalDuration } = await vex.processFiles({
  onFileStart({ path, index, total }) {
    console.log(`Processing ${path}`)
  },
  onFileComplete({ result }) {
    // result.outputs.css, result.outputs.js, result.outputs.dts
  },
  onError({ path, error }) {
    console.error(`Failed: ${path}`, error)
  },
})
```

## How It Works

1. **Transform** - Wraps source with vanilla-extract file scope, transpiles to CommonJS via esbuild, and executes in a Node VM
2. **Capture** - Collects CSS definitions, class names, and compositions during VM execution using a custom vanilla-extract adapter
3. **Output** - Generates `.css` from collected styles, `.js` with serialized exports, and `.d.ts` declarations

## License

MIT
