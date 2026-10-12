// The settings route of the server imports this file without the aliases of
// Vite, so it has no import.

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

export const MAX_LINE_LENGTH = 16;
/** A chart holds 100 000 bars at most, so a first bar has six digits. */
const FIRST_BAR = /^(?:0|[1-9]\d{0,5})$/;
const MAX_SECTION_LINE_LENGTHS = 1000;
/** The form that `songKey` gives: words of a title, `|`, words of an artist. */
const SONG_KEY =
  /^(?:[a-z0-9]+(?: [a-z0-9]+)*)?\|(?:[a-z0-9]+(?: [a-z0-9]+)*)?$/;
const MAX_SONG_KEY_LENGTH = 400;
const FIELDS = [
  'chartId',
  'updatedAt',
  'songLineLength',
  'sectionLineLengths',
  'groupOverride',
];

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The update time in one form, so text order is time order; or null. */
function timestamp(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    return null;
  const text = new Date(value).toISOString();
  // A year of five digits has a different form and a different text order.
  return text.length === 24 ? text : null;
}

function lineLength(value: unknown): value is LineLength {
  return (
    value === 'auto' ||
    (typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= 1 &&
      value <= MAX_LINE_LENGTH)
  );
}

function groupOverride(value: unknown): value is string | null {
  return (
    value === null ||
    value === 'separate' ||
    (typeof value === 'string' &&
      value.length <= MAX_SONG_KEY_LENGTH &&
      SONG_KEY.test(value))
  );
}

/**
 * Check a chart settings record from a screen, the local store, or the
 * network. The result is a new record in one form, or null when a value is
 * not allowed or a field is not known.
 */
export function parseChartSettings(value: unknown): ChartSettings | null {
  if (!object(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== FIELDS.length || keys.some((k) => !FIELDS.includes(k)))
    return null;
  const updatedAt = timestamp(value.updatedAt);
  if (
    typeof value.chartId !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.chartId) ||
    updatedAt === null ||
    !lineLength(value.songLineLength) ||
    !object(value.sectionLineLengths) ||
    !groupOverride(value.groupOverride)
  )
    return null;
  const sections = Object.entries(value.sectionLineLengths);
  if (
    sections.length > MAX_SECTION_LINE_LENGTHS ||
    !sections.every(
      ([bar, length]) => FIRST_BAR.test(bar) && lineLength(length),
    )
  )
    return null;
  return {
    chartId: value.chartId,
    updatedAt,
    songLineLength: value.songLineLength,
    // Keys that are whole numbers read back in number order.
    sectionLineLengths: Object.fromEntries(sections) as Record<
      number,
      LineLength
    >,
    groupOverride: value.groupOverride,
  };
}

/**
 * The three view choices as one text. Two valid records with equal choices
 * give equal text. The text holds only ASCII, so its order is the same in the
 * browser and in the database of the server.
 */
export function chartSettingsBody(settings: ChartSettings): string {
  return JSON.stringify({
    songLineLength: settings.songLineLength,
    sectionLineLengths: settings.sectionLineLengths,
    groupOverride: settings.groupOverride,
  });
}

/** What orders two records of one chart: the update time, then the text. */
export interface ChartSettingsVersion {
  updatedAt: string;
  body: string;
}

export function chartSettingsVersion(
  settings: ChartSettings,
): ChartSettingsVersion {
  return { updatedAt: settings.updatedAt, body: chartSettingsBody(settings) };
}

/**
 * The last write wins. Two writes with one update time and different choices
 * have a fixed order, so all devices and the server keep the same one.
 */
export function isNewerSettingsVersion(
  incoming: ChartSettingsVersion,
  current: ChartSettingsVersion,
): boolean {
  return (
    incoming.updatedAt > current.updatedAt ||
    (incoming.updatedAt === current.updatedAt && incoming.body > current.body)
  );
}

/** True when `incoming` replaces the stored record of its chart. */
export function isNewerChartSettings(
  incoming: ChartSettings,
  current: ChartSettings | undefined,
): boolean {
  return (
    !current ||
    isNewerSettingsVersion(
      chartSettingsVersion(incoming),
      chartSettingsVersion(current),
    )
  );
}

/**
 * The record that a change on this device stores. The change is the last
 * write that this device knows, so its update time goes after the stored
 * record when the clock of the device is behind it. A change that repeats the
 * stored choices keeps the stored record.
 */
export function laterChartSettings(
  change: ChartSettings,
  stored: ChartSettings | undefined,
): ChartSettings {
  if (!stored || change.updatedAt > stored.updatedAt) return change;
  if (chartSettingsBody(change) === chartSettingsBody(stored)) return stored;
  return {
    ...change,
    updatedAt: new Date(Date.parse(stored.updatedAt) + 1).toISOString(),
  };
}

/** The settings of a chart that never had any: all choices automatic. */
export function defaultChartSettings(
  chartId: string,
  now: string,
): ChartSettings {
  return {
    chartId,
    updatedAt: now,
    songLineLength: 'auto',
    sectionLineLengths: {},
    groupOverride: null,
  };
}

/**
 * The settings with a new group override (null removes it). Only the group
 * changes: the line lengths stay as they were.
 */
export function withGroupOverride(
  current: ChartSettings | null,
  chartId: string,
  override: string | null,
  now: string,
): ChartSettings {
  return {
    ...(current ?? defaultChartSettings(chartId, now)),
    updatedAt: now,
    groupOverride: override,
  };
}

/** The overrides of a list of settings, by chart id; no override is left out. */
export function groupOverridesOf(
  settings: ChartSettings[],
): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const item of settings) {
    if (item.groupOverride) overrides[item.chartId] = item.groupOverride;
  }
  return overrides;
}
