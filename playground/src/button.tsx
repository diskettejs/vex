import clsx from 'clsx'
import type { ComponentProps } from 'react'
import * as styles from './button.css.ts'

export function Button({
  children,
  className,
  type = 'button',
  ...props
}: ComponentProps<'button'>) {
  return (
    <button type={type} className={clsx(styles.btn, className)} {...props}>
      {children}
    </button>
  )
}
