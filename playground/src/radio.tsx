import clsx from 'clsx'
import { useId } from 'react'
import * as styles from './radio.css.ts'

export function Radio({
  children,
  className,
  id,
  ...props
}: React.ComponentProps<'input'> & { children: React.ReactNode }) {
  const randomID = useId()
  return (
    <>
      <input
        {...props}
        className={styles.input}
        id={id ?? randomID}
        type="radio"
      />
      <label className={clsx(styles.label, className)} htmlFor={id ?? randomID}>
        {children}
      </label>
    </>
  )
}
