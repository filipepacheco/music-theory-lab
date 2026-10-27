import type { ChartSummary } from '@/domain/chartSummary';

/**
 * The key of one mute. A bass chart is 'bass', a drum chart is 'drums', and
 * any other chart is its id.
 */
export type PlaybackPart = string;

export type PartMutes = Record<PlaybackPart, boolean>;

export const NO_MUTES: PartMutes = { bass: false, drums: false };

const DEFAULT_KEYS: readonly PlaybackPart[] = ['bass', 'drums'];

export interface PartsSoundingInput {
  open: PlaybackPart;
  sameFile: boolean;
  recording: boolean;
  mutes: PartMutes;
  /** The mute keys of all charts on the clock. Bass and drums by default. */
  keys?: readonly PlaybackPart[];
}

export function partsSounding({
  open,
  sameFile,
  recording,
  mutes,
  keys = DEFAULT_KEYS,
}: PartsSoundingInput): PartMutes {
  const reaches = (key: PlaybackPart) => sameFile || key === open;
  return Object.fromEntries(
    keys.map((key) => [key, !recording && reaches(key) && !mutes[key]]),
  );
}

export function playsTogether(
  input: Pick<PartsSoundingInput, 'sameFile' | 'recording'>,
): boolean {
  return input.sameFile && !input.recording;
}

export function muteKeyOf(chart: Pick<ChartSummary, 'id' | 'part'>): string {
  return chart.part === 'bass' || chart.part === 'drums'
    ? chart.part
    : chart.id;
}

export interface MuteControl {
  key: PlaybackPart;
  label: string;
}

const FALLBACK_LABEL: Record<ChartSummary['part'], string> = {
  bass: 'Baixo',
  drums: 'Bateria',
  guitar: 'Guitarra',
  vocals: 'Vocais',
};

export function muteControls(
  charts: readonly Pick<ChartSummary, 'id' | 'part' | 'partName'>[],
): MuteControl[] {
  return charts.map((chart) => ({
    key: muteKeyOf(chart),
    label: chart.partName ?? FALLBACK_LABEL[chart.part],
  }));
}

export type PartEvent<B, D> =
  | { part: 'bass'; time: number; note: B }
  | { part: 'drums'; time: number; hit: D };

export function partsTimeline<
  B extends { time: number },
  D extends { time: number },
>(bass: readonly B[], drums: readonly D[]): PartEvent<B, D>[] {
  const events: PartEvent<B, D>[] = [
    ...bass.map((note) => ({ part: 'bass' as const, time: note.time, note })),
    ...drums.map((hit) => ({ part: 'drums' as const, time: hit.time, hit })),
  ];
  return events.sort((a, b) => a.time - b.time);
}

export function partsSchedule<
  B extends { time: number },
  D extends { time: number },
>(
  input: PartsSoundingInput,
  bass: readonly B[],
  drums: readonly D[],
): PartEvent<B, D>[] {
  const sounding = partsSounding(input);
  return partsTimeline(bass, drums).filter((event) => sounding[event.part]);
}

/** The events of one more chart on the shared clock, with its mute key. */
export interface PartLane<L extends { time: number }> {
  key: PlaybackPart;
  events: readonly L[];
}

export type LaneEvent<B, D, L> =
  | { key: 'bass'; time: number; part: 'bass'; note: B }
  | { key: 'drums'; time: number; part: 'drums'; hit: D }
  | { key: PlaybackPart; time: number; part: 'lane'; event: L };

export function partsLaneTimeline<
  B extends { time: number },
  D extends { time: number },
  L extends { time: number },
>(
  bass: readonly B[],
  drums: readonly D[],
  lanes: readonly PartLane<L>[],
): LaneEvent<B, D, L>[] {
  const events: LaneEvent<B, D, L>[] = [
    ...partsTimeline(bass, drums).map((event) => ({
      ...event,
      key: event.part,
    })),
    ...lanes.flatMap((lane) =>
      lane.events.map((event) => ({
        key: lane.key,
        time: event.time,
        part: 'lane' as const,
        event,
      })),
    ),
  ] as LaneEvent<B, D, L>[];
  return events.sort((a, b) => a.time - b.time);
}

/** The schedule of bass, drums, and any number of other charts. */
export function partsLaneSchedule<
  B extends { time: number },
  D extends { time: number },
  L extends { time: number },
>(
  input: PartsSoundingInput,
  bass: readonly B[],
  drums: readonly D[],
  lanes: readonly PartLane<L>[],
): LaneEvent<B, D, L>[] {
  const sounding = partsSounding({
    ...input,
    keys: input.keys ?? ['bass', 'drums', ...lanes.map((lane) => lane.key)],
  });
  return partsLaneTimeline(bass, drums, lanes).filter(
    (event) => sounding[event.key],
  );
}
