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

/**
 * The line length of the section that starts at `startBar`: its own choice,
 * else the song line length. Without settings the layout is automatic. A set
 * number always holds: the layout never lowers it.
 */
export function sectionLineLength(
  settings: ChartSettings | null,
  startBar: number,
): LineLength {
  if (!settings) return 'auto';
  return settings.sectionLineLengths[startBar] ?? settings.songLineLength;
}

/**
 * The settings with a new line length for the section that starts at
 * `startBar`. Only that section changes. `auto` is stored as a choice, so it
 * also holds against a song line length.
 */
export function withSectionLineLength(
  current: ChartSettings | null,
  chartId: string,
  startBar: number,
  length: LineLength,
  now: string,
): ChartSettings {
  const base = current ?? defaultChartSettings(chartId, now);
  return {
    ...base,
    updatedAt: now,
    sectionLineLengths: { ...base.sectionLineLengths, [startBar]: length },
  };
}

/**
 * The settings with a new song line length. The section line lengths are
 * removed in the same write, so every section follows the song.
 */
export function withSongLineLength(
  current: ChartSettings | null,
  chartId: string,
  length: LineLength,
  now: string,
): ChartSettings {
  const base = current ?? defaultChartSettings(chartId, now);
  return {
    ...base,
    updatedAt: now,
    songLineLength: length,
    sectionLineLengths: {},
  };
}

/**
 * The settings without the own line length of the section that starts at
 * `startBar`: the section then uses the song line length.
 */
export function withoutSectionLineLength(
  current: ChartSettings | null,
  chartId: string,
  startBar: number,
  now: string,
): ChartSettings {
  const base = current ?? defaultChartSettings(chartId, now);
  const rest = { ...base.sectionLineLengths };
  delete rest[startBar];
  return { ...base, updatedAt: now, sectionLineLengths: rest };
}

/** True when the section has its own line length (a number or automatic). */
export function hasOwnSectionLineLength(
  settings: ChartSettings | null,
  startBar: number,
): boolean {
  return settings?.sectionLineLengths[startBar] !== undefined;
}

/**
 * The settings that copy the section line lengths of the old browser store
 * into `current`. A section that the settings already hold keeps its value,
 * and a value that is not allowed is left out. The copy has the import time
 * of its chart as update time, so a real edit on any device is newer. Null
 * when nothing is copied.
 */
export function withBrowserLineLengths(
  current: ChartSettings | null,
  chartId: string,
  browser: unknown,
  importedAt: string,
): ChartSettings | null {
  if (!object(browser)) return null;
  const base = current ?? defaultChartSettings(chartId, importedAt);
  const sections: Record<number, LineLength> = { ...base.sectionLineLengths };
  let copied = false;
  for (const [bar, length] of Object.entries(browser)) {
    if (!FIRST_BAR.test(bar) || !lineLength(length) || length === 'auto')
      continue;
    if (sections[Number(bar)] !== undefined) continue;
    sections[Number(bar)] = length;
    copied = true;
  }
  return copied ? { ...base, sectionLineLengths: sections } : null;
}
