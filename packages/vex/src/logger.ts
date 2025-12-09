import logUpdate from 'log-update'

export interface Logger {
  update(message: string): void
  clear(): void
  log(message: string): void
  render(fn: () => void): void
}

const noop = () => {}

export function createLogger(opts: { quiet?: boolean }): Logger {
  if (opts.quiet) {
    return {
      update: noop,
      clear: noop,
      log: noop,
      render: noop,
    }
  }

  return {
    update: (message: string) => logUpdate(message),
    clear: () => logUpdate.clear(),
    log: (message: string) => console.log(message),
    render: (fn: () => void) => {
      logUpdate.clear()
      fn()
    },
  }
}
