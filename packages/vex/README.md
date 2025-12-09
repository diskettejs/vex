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

# Watch for changes and recompile
vex "src" --watch

# Use a specific tsconfig
vex "src" --tsconfig tsconfig.build.json

# Combine options
vex "src/components" -o dist/css -n
```

### Options

| Option               | Alias | Description                                            | Default |
| -------------------- | ----- | ------------------------------------------------------ | ------- |
| `--output <dir>`     | `-o`  | Directory for compiled CSS, JS, and .d.ts output       | `dist`  |
| `--namespace <name>` |       | Namespace for CSS scoping                              | \*      |
| `--tsconfig <path>`  | `-p`  | Path to tsconfig.json for TypeScript resolution        |         |
| `--dry-run`          | `-n`  | Process files without writing output                   |         |
| `--watch`            | `-w`  | Watch for file changes and recompile                   |         |
| `--quiet`            | `-q`  | Suppress non-error output                              |         |
| `--debug`            | `-d`  | Show configuration and matched files before processing |         |

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
  namespace: 'my-app',
  compilerOptions: { outDir: 'dist' },
})

vex.addSource('src/styles.css.ts')

// Full build with async iteration
for await (const event of vex.build()) {
  switch (event.type) {
    case 'transpile':
      console.log(`Transpiling: ${event.file.path}`)
      break
    case 'complete':
      // event.result.outputs.css, .js, .dts
      break
    case 'done':
      console.log(`Built ${event.results.length} files in ${event.totalDuration}ms`)
      break
  }
}

// Or compile a single file
const result = vex.compile('src/styles.css.ts')
// result.outputs.css, result.outputs.js, result.outputs.dts
```

## How It Works

1. **Transpile** - Wraps source with vanilla-extract file scope and transpiles to CommonJS via TypeScript
2. **Execute** - Runs transpiled code in a Node VM with a custom adapter that captures CSS definitions
3. **Output** - Generates `.css` from collected styles, `.js` with serialized exports, and `.d.ts` declarations

## License

MIT
