# @diskette/vex

## 0.20.0

### Minor Changes

- ba7408c: add identifier CLI flag

### Patch Changes

- c045600: fix table footer formatting

## 0.19.0

### Minor Changes

- 3ecb611: watch mode improvements
- 45a5e2d: improve watch mode handling new files and updates

## 0.18.0

### Minor Changes

- f32011a: initial watch mode implementation

## 0.17.0

### Minor Changes

- 51bd570: refactor implementation to use Repeater

## 0.16.0

### Minor Changes

- af6b265: simplify args handling

## 0.15.0

### Minor Changes

- d82f788: add output paths in debug info
- d5746e2: revert fix for output paths

## 0.14.1

### Patch Changes

- fa29634: fix for outputs getting flattent

## 0.14.0

### Minor Changes

- e470885: refactored compiling source files flow
- f4afa5a: rework internals to use ts to transpile sources

## 0.13.1

### Patch Changes

- f0c1e66: fix CLI blank version and desc

## 0.13.0

### Minor Changes

- f3e1bc0: update to not throw if single file arg doesn't exist

### Patch Changes

- 2ca7ee9: fix for executing .ts code in vm

## 0.12.0

### Minor Changes

- fd95bdf: refactor esbuild transform use to be async

## 0.11.0

### Minor Changes

- 27f1c9b: refactor internal processing flow

## 0.10.1

### Patch Changes

- bf4dad1: fix recursive processing scoping

## 0.10.0

### Minor Changes

- 9924433: increase project tsconfig usage. add --debug flag

## 0.9.1

### Patch Changes

- 6a87d83: remove included all source deps. improve errors feedback

## 0.9.0

### Minor Changes

- 9dcbf5e: improve performance and output formats

## 0.8.0

### Minor Changes

- 92537e9: rename Nex to Vex. Export types

## 0.7.1

### Patch Changes

- 7841d5d: fix .d.ts type generation

## 0.7.0

### Minor Changes

- 957faba: rework implementation

## 0.6.1

### Patch Changes

- 1a6f311: remove console.log during emit

## 0.6.0

### Minor Changes

- 92757d9: fix CSS imports

## 0.5.0

### Minor Changes

- 7750ba5: Read a project's tsconfig instead of generated config

## 0.4.0

### Minor Changes

- 6a7d04c: Refactor eval process to accurately preserve literal types

## 0.3.2

### Patch Changes

- 01b738b: add declaration: true to generated config

## 0.3.1

### Patch Changes

- 88565f3: fix generateConfig configPath

## 0.3.0

### Minor Changes

- 0273d21: Remove watch mode
- 8ae7068: Rework implementation to use @typescript/vfs

## 0.2.1

### Patch Changes

- c779758: add default to tsconfig flag

## 0.2.0

### Minor Changes

- 5a08009: fix issue with duplicate CSS imports

## 0.1.2

### Patch Changes

- 486408b: basic watch mode implementation
