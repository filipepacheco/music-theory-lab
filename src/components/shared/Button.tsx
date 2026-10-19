import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary';
  size?: 'md' | 'sm';
  pressed?: boolean;
  live?: boolean;
}

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
