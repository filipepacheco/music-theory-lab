import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `primary` is the one filled action of a view. */
  variant?: 'default' | 'primary';
  size?: 'md' | 'sm';
  /** The state of a toggle. Sets `aria-pressed`. */
  pressed?: boolean;
  /** The thing this button controls runs now: lamp colour. */
  live?: boolean;
}

/** The Lighthouse button: `[ label ]`, inverted under the pointer. */
export default function Button({
  variant = 'default',
  size = 'md',
  pressed,
  live = false,
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  const classes = [
    'lh-btn',
    variant === 'primary' && 'is-primary',
    size === 'sm' && 'is-small',
    live && 'is-live',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} aria-pressed={pressed} className={classes} {...rest} />
  );
}
