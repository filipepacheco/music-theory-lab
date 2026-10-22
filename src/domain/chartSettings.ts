export type LineLength = number | 'auto';

export type PracticeTuning = 'original' | 'standard' | 'drop-d';

export interface ChartTransposition {
  semitones: number;
  tuning: PracticeTuning;
}

export interface ChartSettings {
  chartId: string;
  updatedAt: string;
  songLineLength: LineLength;
  sectionLineLengths: Record<number, LineLength>;
  groupOverride: string | null;
  barOctaves?: Record<number, number>;
  transposition?: ChartTransposition;
}

export const MAX_LINE_LENGTH = 16;
const FIRST_BAR = /^(?:0|[1-9]\d{0,5})$/;
const MAX_SECTION_LINE_LENGTHS = 1000;
const KEY_WORDS = String.raw`(?:[\p{L}\p{M}\p{N}]+(?: [\p{L}\p{M}\p{N}]+)*)?`;
const SONG_KEY = new RegExp(`^${KEY_WORDS}\\|${KEY_WORDS}$`, 'u');
const MAX_SONG_KEY_LENGTH = 400;
export const MAX_BAR_OCTAVE = 2;
const MAX_BAR_OCTAVES = 5000;
export const MAX_TRANSPOSITION = 12;
const PRACTICE_TUNINGS: readonly string[] = ['original', 'standard', 'drop-d'];
export const ORIGINAL_TRANSPOSITION: ChartTransposition = {
  semitones: 0,
  tuning: 'original',
};
const OPTIONAL_FIELDS = ['barOctaves', 'transposition'];
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

function songKeyText(value: string): boolean {
  return (
    SONG_KEY.test(value) &&
    value ===
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .normalize('NFC')
  );
}

function barOctave(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value !== 0 &&
    Math.abs(value) <= MAX_BAR_OCTAVE
  );
}

function barOctaves(value: unknown): Record<number, number> | null {
  if (value === undefined) return {};
  if (!object(value)) return null;
  const bars = Object.entries(value);
  if (
    bars.length > MAX_BAR_OCTAVES ||
    !bars.every(([bar, octave]) => FIRST_BAR.test(bar) && barOctave(octave))
  )
    return null;
  return Object.fromEntries(bars) as Record<number, number>;
}

function isOriginalTransposition(value: ChartTransposition): boolean {
  return value.semitones === 0 && value.tuning === 'original';
}

function transposition(value: unknown): ChartTransposition | null | undefined {
  if (value === undefined) return undefined;
  if (!object(value)) return null;
  const keys = Object.keys(value);
  const { semitones, tuning } = value;
  if (
    keys.length !== 2 ||
    typeof semitones !== 'number' ||
    !Number.isInteger(semitones) ||
    Math.abs(semitones) > MAX_TRANSPOSITION ||
    typeof tuning !== 'string' ||
    !PRACTICE_TUNINGS.includes(tuning)
  )
    return null;
  const parsed = { semitones, tuning: tuning as PracticeTuning };
  return isOriginalTransposition(parsed) ? null : parsed;
}

function groupOverride(value: unknown): value is string | null {
  return (
    value === null ||
    value === 'separate' ||
    (typeof value === 'string' &&
      value.length <= MAX_SONG_KEY_LENGTH &&
      songKeyText(value))
  );
}

export function parseChartSettings(value: unknown): ChartSettings | null {
  if (!object(value)) return null;
  const keys = Object.keys(value);
  if (
    FIELDS.some((k) => !keys.includes(k)) ||
    keys.some((k) => !FIELDS.includes(k) && !OPTIONAL_FIELDS.includes(k))
  )
    return null;
  const updatedAt = timestamp(value.updatedAt);
  const octaves = barOctaves(value.barOctaves);
  const practice = transposition(value.transposition);
  if (
    octaves === null ||
    practice === null ||
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
    sectionLineLengths: Object.fromEntries(sections) as Record<
      number,
      LineLength
    >,
    groupOverride: value.groupOverride,
    ...(Object.keys(octaves).length > 0 && { barOctaves: octaves }),
    ...(practice && { transposition: practice }),
  };
}

/**
 * ASCII only: a string orders differently in the browser and in the database
 * of the server for characters outside the BMP.
 */
export function chartSettingsBody(settings: ChartSettings): string {
  return JSON.stringify({
    songLineLength: settings.songLineLength,
    sectionLineLengths: settings.sectionLineLengths,
    groupOverride: settings.groupOverride,
    ...(Object.keys(settings.barOctaves ?? {}).length > 0 && {
      barOctaves: settings.barOctaves,
    }),
    ...(settings.transposition && {
      transposition: {
        semitones: settings.transposition.semitones,
        tuning: settings.transposition.tuning,
      },
    }),
  }).replace(
    /[\u0080-\uffff]/g,
    (unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

export interface ChartSettingsVersion {
  updatedAt: string;
  body: string;
}

export function chartSettingsVersion(
  settings: ChartSettings,
): ChartSettingsVersion {
  return { updatedAt: settings.updatedAt, body: chartSettingsBody(settings) };
}

export function isNewerSettingsVersion(
  incoming: ChartSettingsVersion,
  current: ChartSettingsVersion,
): boolean {
  return (
    incoming.updatedAt > current.updatedAt ||
    (incoming.updatedAt === current.updatedAt && incoming.body > current.body)
  );
}

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

export function groupOverridesOf(
  settings: ChartSettings[],
): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const item of settings) {
    if (item.groupOverride) overrides[item.chartId] = item.groupOverride;
  }
  return overrides;
}

export function sectionLineLength(
  settings: ChartSettings | null,
  startBar: number,
): LineLength {
  if (!settings) return 'auto';
  return settings.sectionLineLengths[startBar] ?? settings.songLineLength;
}

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

export function hasOwnSectionLineLength(
  settings: ChartSettings | null,
  startBar: number,
): boolean {
  return settings?.sectionLineLengths[startBar] !== undefined;
}

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

export function withBarOctave(
  current: ChartSettings | null,
  chartId: string,
  bars: readonly number[],
  octave: number,
  now: string,
): ChartSettings {
  const base = current ?? defaultChartSettings(chartId, now);
  const octaves = { ...base.barOctaves };
  for (const bar of bars) {
    if (octave === 0) delete octaves[bar];
    else octaves[bar] = octave;
  }
  const { barOctaves: _dropped, ...rest } = base;
  return {
    ...rest,
    updatedAt: now,
    ...(Object.keys(octaves).length > 0 && { barOctaves: octaves }),
  };
}

export function withoutBarOctaves(
  current: ChartSettings | null,
  chartId: string,
  now: string,
): ChartSettings {
  const { barOctaves: _dropped, ...rest } =
    current ?? defaultChartSettings(chartId, now);
  return { ...rest, updatedAt: now };
}

export function chartTransposition(
  settings: ChartSettings | null,
): ChartTransposition {
  return settings?.transposition ?? ORIGINAL_TRANSPOSITION;
}

export function withTransposition(
  current: ChartSettings | null,
  chartId: string,
  next: ChartTransposition,
  now: string,
): ChartSettings {
  const { transposition: _dropped, ...rest } =
    current ?? defaultChartSettings(chartId, now);
  return {
    ...rest,
    updatedAt: now,
    ...(!isOriginalTransposition(next) && {
      transposition: { semitones: next.semitones, tuning: next.tuning },
    }),
  };
}
