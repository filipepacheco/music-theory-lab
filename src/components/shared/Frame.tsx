import type { HTMLAttributes, ReactNode } from 'react';

type FrameVariant = 'single' | 'double' | 'heavy' | 'dashed' | 'corners';

interface FrameProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Sits in the top border, in upper case. */
  title?: ReactNode;
  /** The element of the title. A module frame gives its heading level. */
  titleAs?: 'h2' | 'h3' | 'h4' | 'span';
  /** A hint in the bottom border, at the right. */
  foot?: ReactNode;
  variant?: FrameVariant;
  /** A live state (playing, recording): a double border in the lamp colour. */
  live?: boolean;
  /** Folds the frame to its title line. The caller hides the children. */
  collapsed?: boolean;
  as?: 'div' | 'section';
}

/**
 * The Lighthouse frame: a box with its title in the top border. The title
 * covers the border with `--lh-ground`; set that variable on a frame that
 * sits on a ground other than the page.
 */
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
