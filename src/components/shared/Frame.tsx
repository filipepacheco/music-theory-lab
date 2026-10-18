import type { HTMLAttributes, ReactNode } from 'react';

type FrameVariant = 'single' | 'double' | 'heavy' | 'dashed' | 'corners';

interface FrameProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  titleAs?: 'h2' | 'h3' | 'h4' | 'span';
  foot?: ReactNode;
  variant?: FrameVariant;
  live?: boolean;
  collapsed?: boolean;
  as?: 'div' | 'section';
}

export default function Frame({
  title,
  titleAs: Title = 'span',
  foot,
  variant = 'single',
  live = false,
  collapsed = false,
  as: Element = 'div',
  className,
  children,
  ...rest
}: FrameProps) {
  const classes = [
    'lh-frame',
    variant !== 'single' && `is-${variant}`,
    live && 'is-focus',
    collapsed && 'is-collapsed',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Element className={classes} {...rest}>
      {title != null && <Title className="lh-frame-title">{title}</Title>}
      {children}
      {foot != null && <span className="lh-frame-foot">{foot}</span>}
    </Element>
  );
}
