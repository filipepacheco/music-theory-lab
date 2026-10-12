import type { SelectHTMLAttributes } from 'react';

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/**
 * A native select with the Lighthouse look. `className` goes to the wrapper,
 * which holds the arrow; use it for layout. It has no visible label, so give
 * it an `aria-label` or a label of your own.
 */
export default function Select({ className, children, ...rest }: SelectProps) {
  return (
    <span className={['lh-select', className].filter(Boolean).join(' ')}>
      <select {...rest}>{children}</select>
    </span>
  );
}
