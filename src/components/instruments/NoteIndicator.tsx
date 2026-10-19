interface NoteIndicatorProps {
  noteName: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function NoteIndicator({
  noteName,
  color,
  size = 'sm',
}: NoteIndicatorProps) {
  const sizeClasses =
    size === 'sm'
      ? 'w-5 h-5 text-micro'
      : size === 'md'
        ? 'w-6 h-6 text-xs'
        : 'w-7 h-7 text-xs';

  return (
    <span
      className={`${sizeClasses} flex items-center justify-center font-bold text-on-accent shrink-0`}
      style={{ backgroundColor: color }}
    >
      {noteName}
    </span>
  );
}
