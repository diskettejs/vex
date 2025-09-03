# Vex

A TypeScript build tool that utilizes TypeScript's API for compiling [@vanilla-extract/css](https://vanilla-extract.style/) files.

## Installation

Note: `@vanilla-extract/css` is a peer dependency and must be installed.

```bash
npm install @diskette/vex
```

```bash
pnpm add @diskette/vex
```

## CLI Usage

```bash
npx @diskette/vex
```

Or add to `package.json` scripts

```bash
{
  "scripts": {
    "build": "vex"
  }
}
```

### CLI Options

| Option       | Alias | Type      | Default   | Description                                          |
| ------------ | ----- | --------- | --------- | ---------------------------------------------------- | --- |
| `--ident`    | `-i`  | `string`  | `"short"` | CSS class identifier format (`"short"` or `"debug"`) |
| `--css-ext`  |       | `string`  |           | Custom CSS file extension (e.g., `.module.css`)      |
| `--imports`  |       | `boolean` | `true`    | Generate CSS import statements in output files       |
| `--tsconfig` |       | `string`  |           | Path to TypeScript config file                       |     |

### Examples

```bash
# Basic compilation. Expects a `tsconfig.json` in the project root dir.
vex

# Use debug identifiers for development
vex --ident debug

# Custom CSS file extension
vex --css-ext .module.css

# Include CSS imports in the JS output
vex --imports

# CSS imports are are not included in the JS output
vex --no-imports

# Use specific tsconfig file
vex --tsconfig ./tsconfig.build.json

# Combine options
vex --ident debug --imports --css-ext .styles.css
```

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

## Configuration Requirements

Your `tsconfig.json` must include:

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  },
  "include": ["**/*.css.ts", "**/*.css.js"]
}
```

## License

MIT
