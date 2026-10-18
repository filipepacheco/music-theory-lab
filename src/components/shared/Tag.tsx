import type { HTMLAttributes } from 'react';

export type TagTone =
  | 'dim'
  | 'bright'
  | 'live'
  | 'success'
  | 'warning'
  | 'danger'
  | 'tonic'
  | 'subdominant'
  | 'dominant';

const TONE_CLASS: Record<TagTone, string> = {
  dim: '',
  bright: 'is-bright',
  live: 'is-beam',
  success: 'is-buoy',
  warning: 'is-flare',
  danger: 'is-wreck',
  tonic: 'is-tonic',
  subdominant: 'is-subdominant',
  dominant: 'is-dominant',
};

interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: TagTone;
}

export default function Tag({ tone = 'dim', className, ...rest }: TagProps) {
  const classes = ['lh-tag', TONE_CLASS[tone], className]
    .filter(Boolean)
    .join(' ');

  return <span className={classes} {...rest} />;
}
