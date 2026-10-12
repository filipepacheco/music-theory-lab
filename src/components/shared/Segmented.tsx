import type { ReactNode } from 'react';

interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  /** Names the group for a screen reader. */
  label: string;
  className?: string;
}

/** A boxed row of tabs for one choice of a few. The chosen one is inverted. */
export default function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={['lh-tabs is-boxed', className].filter(Boolean).join(' ')}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="lh-tab"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
