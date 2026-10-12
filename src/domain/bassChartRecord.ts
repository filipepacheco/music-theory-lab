import {
  STANDARD_OPEN_MIDI,
  type BassChart,
  type BassTechnique,
} from './bassChart.js';
import {
  DRUM_ARTICULATIONS,
  DRUM_CHART_PIECES,
  DRUM_DYNAMICS,
  type Chart,
  type DrumChart,
} from './drumChart.js';

/** A null chart is a durable deletion, so offline devices cannot resurrect it. */
export interface BassChartRecord {
  id: string;
  updatedAt: string;
  /** A bass chart or a drum chart: the two use one table and one route. */
  chart: Chart | null;
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

/** The fields that a bass chart and a drum chart share. */
const SHARED_FIELDS = [
  'schemaVersion',
  'id',
  'sourceFileName',
  'source',
  'importedAt',
  'title',
  'artist',
  'album',
  'year',
  'songLengthSeconds',
  'averageTempoBpm',
  'bars',
  'sections',
];

/**
 * The checks of the id, the metadata, the bars, and the sections, which are
 * the same for the two chart types. `own` names the other fields that the
 * chart type allows.
 */
function validSharedFields(
  value: Record<string, unknown>,
  own: string[],
): boolean {
  const fields = new Set([...SHARED_FIELDS, ...own]);
  if (Object.keys(value).some((key) => !fields.has(key))) return false;
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
    !finite(value.songLengthSeconds) ||
    value.songLengthSeconds <= 0 ||
    !finite(value.averageTempoBpm) ||
    value.averageTempoBpm <= 0 ||
    !Array.isArray(value.bars) ||
    value.bars.length === 0 ||
    value.bars.length > 100_000 ||
    !Array.isArray(value.sections) ||
    value.sections.length === 0
  )
    return false;

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
    return false;
  return (
    value.sections.every(
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
    ) && value.sections[value.sections.length - 1].endBar === bars.length
  );
}

/**
 * Validate an external bass chart before it reaches analysis or playback. A
 * bass chart has no part field, so a drum chart fails here.
 */
export function parseBassChart(value: unknown): BassChart | null {
  if (!object(value)) return null;
  if (!validSharedFields(value, ['tuning', 'notes', 'originalFingering']))
    return null;
  if (
    !Array.isArray(value.tuning) ||
    value.tuning.length !== 4 ||
    !value.tuning.every(integer) ||
    !Array.isArray(value.notes) ||
    value.notes.length > 200_000
  )
    return null;

  const bars = value.bars as unknown[];
  const tuning = value.tuning;
  const notes = value.notes;
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
  if (
    value.originalFingering !== undefined &&
    (value.source !== 'gp' ||
      !Array.isArray(value.originalFingering) ||
      value.originalFingering.length !== value.notes.length ||
      !value.originalFingering.every(
        (position, i) =>
          object(position) &&
          Object.keys(position).every(
            (key) => key === 'string' || key === 'fret',
          ) &&
          integer(position.string) &&
          position.string >= 0 &&
          position.string < 4 &&
          integer(position.fret) &&
          position.fret >= 0 &&
          notes[i].midi ===
            STANDARD_OPEN_MIDI[position.string] +
              tuning[position.string] +
              position.fret,
      ))
  )
    return null;
  return value as unknown as BassChart;
}

const HIT_FIELDS = new Set([
  'time',
  'bar',
  'beatInBar',
  'piece',
  'articulation',
  'dynamic',
  'intensity',
  'midi',
]);
const pieces = new Set<unknown>(DRUM_CHART_PIECES);
const articulations = new Set<unknown>(DRUM_ARTICULATIONS);
const dynamics = new Set<unknown>(DRUM_DYNAMICS);

/**
 * Validate an external drum chart. The piece of a hit is not compared with
 * its MIDI number: a chart from an earlier map of drum pieces stays valid.
 */
export function parseDrumChart(value: unknown): DrumChart | null {
  if (!object(value) || value.part !== 'drums') return null;
  if (!validSharedFields(value, ['part', 'hits'])) return null;
  if (
    (value.source !== 'midi' && value.source !== 'gp') ||
    !Array.isArray(value.hits) ||
    value.hits.length === 0 ||
    value.hits.length > 200_000
  )
    return null;

  const bars = value.bars as unknown[];
  if (
    !value.hits.every(
      (hit, i, hits) =>
        object(hit) &&
        Object.keys(hit).length === HIT_FIELDS.size &&
        Object.keys(hit).every((key) => HIT_FIELDS.has(key)) &&
        finite(hit.time) &&
        hit.time >= 0 &&
        (i === 0 || hit.time >= hits[i - 1].time) &&
        integer(hit.bar) &&
        hit.bar >= 0 &&
        hit.bar < bars.length &&
        finite(hit.beatInBar) &&
        hit.beatInBar >= 0 &&
        pieces.has(hit.piece) &&
        articulations.has(hit.articulation) &&
        dynamics.has(hit.dynamic) &&
        integer(hit.intensity) &&
        hit.intensity >= 1 &&
        hit.intensity <= 127 &&
        integer(hit.midi) &&
        hit.midi >= 0 &&
        hit.midi <= 127,
    )
  )
    return null;
  return value as unknown as DrumChart;
}

/**
 * Validate a chart of the one or the other type. A chart with a part field
 * is a drum chart; a bass chart has none, so stored bass charts stay valid.
 */
export function parseChart(value: unknown): Chart | null {
  return object(value) && 'part' in value
    ? parseDrumChart(value)
    : parseBassChart(value);
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
  const chart = value.chart === null ? null : parseChart(value.chart);
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
