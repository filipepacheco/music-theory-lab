import type { HTMLAttributes, ReactNode } from 'react';

type CalloutTone = 'info' | 'success' | 'warning' | 'danger';

const TONE_CLASS: Record<CalloutTone, string> = {
  info: '',
  success: 'is-buoy',
  warning: 'is-flare',
  danger: 'is-wreck',
};

interface CalloutProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: CalloutTone;
  title?: ReactNode;
}

export default function Callout({
  tone = 'info',
  title,
  className,
  children,
  ...rest
}: CalloutProps) {
  const classes = ['lh-callout', TONE_CLASS[tone], className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} {...rest}>
      {title != null && <strong className="block">{title}</strong>}
      {children}
    </div>
  );
}
