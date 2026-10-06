import {
  STANDARD_OPEN_MIDI,
  type BassChart,
  type BassTechnique,
} from './bassChart.js';

/** A null chart is a durable deletion, so offline devices cannot resurrect it. */
export interface BassChartRecord {
  id: string;
  updatedAt: string;
  chart: BassChart | null;
}

const techniques = new Set<BassTechnique>([
  'mute',
  'accent',
  'hammerOn',
  'pullOff',
  'slide',
  'harmonic',
  'palmMute',
  'slap',
  'pop',
  'tap',
  'vibrato',
  'bend',
  'tremolo',
]);

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function integer(value: unknown): value is number {
  return finite(value) && Number.isInteger(value);
}

function timestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value))
  );
}

/** Validate external charts before letting them reach analysis or playback. */
export function parseBassChart(value: unknown): BassChart | null {
  if (!object(value)) return null;
  const fields = new Set([
    'schemaVersion',
    'id',
    'sourceFileName',
    'source',
    'importedAt',
    'title',
    'artist',
    'album',
    'year',
    'tuning',
    'songLengthSeconds',
    'averageTempoBpm',
    'bars',
    'sections',
    'notes',
  ]);
  if (Object.keys(value).some((key) => !fields.has(key))) return null;
  if (
    value.schemaVersion !== 1 ||
    typeof value.id !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.id) ||
    !timestamp(value.importedAt) ||
    !['sourceFileName', 'title', 'artist', 'album'].every(
      (key) => typeof value[key] === 'string',
    ) ||
    (value.source !== undefined &&
      !['rocksmith', 'midi', 'gp'].includes(String(value.source))) ||
    (value.year !== null && !integer(value.year)) ||
    !Array.isArray(value.tuning) ||
    value.tuning.length !== 4 ||
    !value.tuning.every(integer) ||
    !finite(value.songLengthSeconds) ||
    value.songLengthSeconds <= 0 ||
    !finite(value.averageTempoBpm) ||
    value.averageTempoBpm <= 0 ||
    !Array.isArray(value.bars) ||
    value.bars.length === 0 ||
    value.bars.length > 100_000 ||
    !Array.isArray(value.notes) ||
    value.notes.length > 200_000 ||
    !Array.isArray(value.sections) ||
    value.sections.length === 0
  )
    return null;

  const bars = value.bars;
  if (
    !bars.every(
      (bar, i) =>
        object(bar) &&
        bar.index === i &&
        finite(bar.startTime) &&
        bar.startTime >= 0 &&
        finite(bar.endTime) &&
        bar.endTime > bar.startTime &&
        integer(bar.beatCount) &&
        bar.beatCount > 0 &&
        (i === 0 || bar.startTime === bars[i - 1].endTime),
    )
  )
    return null;
  if (
    !value.sections.every(
      (section, i, sections) =>
        object(section) &&
        typeof section.name === 'string' &&
        integer(section.parts) &&
        section.parts > 0 &&
        integer(section.startBar) &&
        integer(section.endBar) &&
        section.startBar >= 0 &&
        section.endBar > section.startBar &&
        section.endBar <= bars.length &&
        (i === 0
          ? section.startBar === 0
          : section.startBar === sections[i - 1].endBar),
    ) ||
    value.sections[value.sections.length - 1].endBar !== bars.length
  )
    return null;

  const tuning = value.tuning;
  if (
    !value.notes.every(
      (note, i, notes) =>
        object(note) &&
        finite(note.time) &&
        note.time >= 0 &&
        (i === 0 || note.time >= notes[i - 1].time) &&
        finite(note.endTime) &&
        note.endTime >= note.time &&
        integer(note.string) &&
        note.string >= 0 &&
        note.string < 4 &&
        integer(note.fret) &&
        note.fret >= 0 &&
        integer(note.midi) &&
        note.midi >= 0 &&
        note.midi <= 127 &&
        note.midi ===
          STANDARD_OPEN_MIDI[note.string] + tuning[note.string] + note.fret &&
        finite(note.sustain) &&
        note.sustain >= 0 &&
        integer(note.bar) &&
        note.bar >= 0 &&
        note.bar < bars.length &&
        finite(note.beatInBar) &&
        note.beatInBar >= 0 &&
        (note.slideToFret === null ||
          (integer(note.slideToFret) && note.slideToFret >= 0)) &&
        Array.isArray(note.techniques) &&
        note.techniques.every((t) => techniques.has(t)),
    )
  )
    return null;
  return value as unknown as BassChart;
}

export function parseBassChartRecord(value: unknown): BassChartRecord | null {
  if (
    !object(value) ||
    Object.keys(value).some((k) => !['id', 'updatedAt', 'chart'].includes(k))
  )
    return null;
  if (
    typeof value.id !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.id) ||
    !timestamp(value.updatedAt)
  )
    return null;
  const chart = value.chart === null ? null : parseBassChart(value.chart);
  if (value.chart !== null && (!chart || chart.id !== value.id)) return null;
  return {
    id: value.id,
    updatedAt: new Date(value.updatedAt).toISOString(),
    chart,
  };
}

export function isNewerChartRecord(
  incoming: BassChartRecord,
  current: BassChartRecord | undefined,
): boolean {
  return (
    !current ||
    incoming.updatedAt > current.updatedAt ||
    (incoming.updatedAt === current.updatedAt &&
      incoming.chart === null &&
      current.chart !== null)
  );
}
