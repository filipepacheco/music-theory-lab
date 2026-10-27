import type { BassChart, BassChartBar, BassChartSection } from './bassChart.js';
import type { GuitarChart } from './guitarChart.js';
import type { VocalChart } from './vocalChart.js';

export const DRUM_CHART_PIECES = [
  'bumbo',
  'caixa',
  'chimbal',
  'tomAgudo',
  'tomMedio',
  'surdo',
  'pratoAtaque',
  'pratoConducao',
  'outros',
] as const;
export type DrumChartPiece = (typeof DRUM_CHART_PIECES)[number];

export const DRUM_PIECE_LABEL: Record<DrumChartPiece, string> = {
  bumbo: 'Bumbo',
  caixa: 'Caixa',
  chimbal: 'Chimbal',
  tomAgudo: 'Tom agudo',
  tomMedio: 'Tom médio',
  surdo: 'Surdo',
  pratoAtaque: 'Prato de ataque',
  pratoConducao: 'Prato de condução',
  outros: 'Outros',
};

export const DRUM_ARTICULATIONS = [
  'normal',
  'crossStick',
  'closed',
  'open',
  'pedal',
  'china',
  'splash',
  'bell',
] as const;
export type DrumArticulation = (typeof DRUM_ARTICULATIONS)[number];

export const DRUM_DYNAMICS = ['ghost', 'normal', 'accent'] as const;
export type DrumDynamic = (typeof DRUM_DYNAMICS)[number];

export interface DrumSound {
  piece: DrumChartPiece;
  articulation: DrumArticulation;
}

const sound = (
  piece: DrumChartPiece,
  articulation: DrumArticulation = 'normal',
): DrumSound => ({ piece, articulation });

const GENERAL_MIDI_DRUMS: Record<number, DrumSound> = {
  35: sound('bumbo'),
  36: sound('bumbo'),
  37: sound('caixa', 'crossStick'),
  38: sound('caixa'),
  40: sound('caixa'),
  41: sound('surdo'),
  42: sound('chimbal', 'closed'),
  43: sound('surdo'),
  44: sound('chimbal', 'pedal'),
  45: sound('tomMedio'),
  46: sound('chimbal', 'open'),
  47: sound('tomMedio'),
  48: sound('tomAgudo'),
  49: sound('pratoAtaque'),
  50: sound('tomAgudo'),
  51: sound('pratoConducao'),
  52: sound('pratoAtaque', 'china'),
  53: sound('pratoConducao', 'bell'),
  55: sound('pratoAtaque', 'splash'),
  57: sound('pratoAtaque'),
  59: sound('pratoConducao'),
};

export function drumSoundOf(midi: number): DrumSound {
  return { ...(GENERAL_MIDI_DRUMS[midi] ?? sound('outros')) };
}

export interface DrumHit {
  time: number;
  bar: number;
  beatInBar: number;
  piece: DrumChartPiece;
  articulation: DrumArticulation;
  dynamic: DrumDynamic;
  intensity: number;
  midi: number;
}

export interface DrumChart {
  schemaVersion: 1;
  id: string;
  part: 'drums';
  sourceFileName: string;
  source: 'midi' | 'gp';
  importedAt: string;
  title: string;
  artist: string;
  album: string;
  year: number | null;
  songLengthSeconds: number;
  averageTempoBpm: number;
  bars: BassChartBar[];
  sections: BassChartSection[];
  hits: DrumHit[];
}

export type Chart = BassChart | DrumChart | GuitarChart | VocalChart;

export function isDrumChart(chart: Chart): chart is DrumChart {
  return 'part' in chart && chart.part === 'drums';
}

/** A chart of the bass: it has no `part`. */
export function isBassChart(chart: Chart): chart is BassChart {
  return !('part' in chart);
}
