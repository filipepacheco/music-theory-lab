import {
  formatDuration,
  sectionColorIndexes,
  sectionColorVar,
  type SectionSegment,
} from './libraryData';

interface Props {
  sections: SectionSegment[];
  durationSeconds: number;
  /** Index of the section under the playhead, or -1 for none. */
  activeIndex: number;
  /** Playhead position in seconds, or null to hide the marker. */
  progressSeconds: number | null;
  /** Null when there is no audio to seek. */
  onSeek: ((seconds: number) => void) | null;
}

/**
 * Proportional strip of the track's detected sections. Widths follow real
 * durations so the shape of the arrangement is readable at a glance, with a
 * floor wide enough that a two-second section is still a clickable target.
 */
export default function LibrarySectionTimeline({
  sections,
  durationSeconds,
  activeIndex,
  progressSeconds,
  onSeek,
}: Props) {
  if (sections.length === 0) return null;

  const total =
    durationSeconds > 0
      ? durationSeconds
      : sections[sections.length - 1].end_seconds;
  const colorIndexes = sectionColorIndexes(sections);
  const playheadPercent =
    progressSeconds === null || total <= 0
      ? null
      : Math.min(100, Math.max(0, (progressSeconds / total) * 100));

  return (
    <div className="relative flex gap-0.5 overflow-hidden rounded-button">
      {sections.map((section, index) => {
        const color = sectionColorVar(colorIndexes.get(section.label) ?? 0);
        const isActive = index === activeIndex;
        const span = Math.max(0, section.end_seconds - section.start_seconds);
        return (
          <button
            key={`${section.start_seconds}-${index}`}
            type="button"
            onClick={onSeek ? () => onSeek(section.start_seconds) : undefined}
            disabled={onSeek === null}
            title={`Trecho ${section.label} · ${formatDuration(
              section.start_seconds,
            )}–${formatDuration(section.end_seconds)}`}
            className={[
              'h-9 min-w-[1.5rem] flex items-center justify-center',
              'font-heading text-[11px] transition-colors',
              isActive ? 'text-text-primary' : 'text-text-secondary',
              onSeek ? 'cursor-pointer' : 'cursor-default',
            ].join(' ')}
            style={{
              flexGrow: span,
              flexBasis: 0,
              backgroundColor: `color-mix(in srgb, ${color} ${
                isActive ? 42 : 18
              }%, transparent)`,
              borderBottom: `2px solid ${color}`,
            }}
          >
            {section.label}
          </button>
        );
      })}
      {playheadPercent !== null && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 bottom-0 w-px bg-text-primary"
          style={{ left: `${playheadPercent}%` }}
        />
      )}
    </div>
  );
}
