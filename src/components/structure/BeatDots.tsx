import type { TimeSignature } from '@/types';

const DOT_COUNTS: Record<TimeSignature, number> = {
  '4/4': 8,
  '3/4': 6,
  '2/4': 4,
  '6/8': 6,
};

interface BeatDotsProps {
  timeSignature: TimeSignature;
  accents?: number[];
  color?: string;
}

export default function BeatDots({
  timeSignature,
  accents,
  color,
}: BeatDotsProps) {
  const count = DOT_COUNTS[timeSignature];
  const accentSet = new Set(accents ?? []);

  return (
    <div className="flex items-center gap-[1.5px] sm:gap-[2px]">
      {Array.from({ length: count }, (_, idx) => {
        const isAccent = accentSet.has(idx);
        const isDownbeat = idx % 2 === 0;
        return (
          <div
            key={idx}
            className={`rounded-full ${
              isDownbeat
                ? isAccent
                  ? 'w-[5px] h-[5px] sm:w-[6px] sm:h-[6px]'
                  : 'w-[4px] h-[4px] sm:w-[4px] sm:h-[4px]'
                : isAccent
                  ? 'w-[3px] h-[3px] sm:w-[4px] sm:h-[4px]'
                  : 'w-[2px] h-[2px] sm:w-[2.5px] sm:h-[2.5px]'
            }`}
            style={{
              backgroundColor: isAccent
                ? (color ?? 'var(--color-text-primary)')
                : (color ? color + '40' : 'var(--color-text-muted)'),
              opacity: isAccent ? 1 : isDownbeat ? 0.45 : 0.25,
            }}
          />
        );
      })}
    </div>
  );
}

export { DOT_COUNTS };
