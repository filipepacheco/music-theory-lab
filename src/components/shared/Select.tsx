import type { SelectHTMLAttributes } from 'react';

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export default function Select({ className, children, ...rest }: SelectProps) {
  return (
    <span className={['lh-select', className].filter(Boolean).join(' ')}>
      <select {...rest}>{children}</select>
    </span>
  );
}
