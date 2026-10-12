/** Bars in each line of a section: 1 to 16, or the automatic layout. */
export type LineLength = number | 'auto';

/**
 * The view choices of one chart, kept apart from the chart so a change never
 * rewrites the chart itself. They outlive the deletion of their chart and
 * apply again when the same file returns.
 */
export interface ChartSettings {
  chartId: string;
  updatedAt: string;
  songLineLength: LineLength;
  /** By the first bar of a section; a missing bar uses the song line length. */
  sectionLineLengths: Record<number, LineLength>;
  /** A song key, `separate`, or null for the calculated group. */
  groupOverride: string | null;
}
