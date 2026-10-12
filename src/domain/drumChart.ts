// The chart route of the server loads this module. Vercel emits ESM without
// Vite's aliases, so each import here is a relative `.js` path.
import type { BassChart, BassChartBar, BassChartSection } from './bassChart.js';

/**
 * The drum pieces of a drum chart. The groove grid of the Estrutura module
 * keeps its own three: `bumbo`, `caixa`, and `chimbal`.
 */
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

/** How a drum piece is hit, when General MIDI gives it a number of its own. */
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

/** A ghost note is a very soft hit; an accent is a hit that stands out. */
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

/** The General MIDI percussion numbers that name a drum piece. */
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

/** The drum piece and the articulation of a General MIDI percussion number. */
export function drumSoundOf(midi: number): DrumSound {
  return { ...(GENERAL_MIDI_DRUMS[midi] ?? sound('outros')) };
}

export interface DrumHit {
  time: number;
  bar: number;
  /** Beats from the downbeat of the bar. */
  beatInBar: number;
  piece: DrumChartPiece;
  articulation: DrumArticulation;
  /** The ghost note or the accent that the source gives to the hit. */
  dynamic: DrumDynamic;
  /** The MIDI velocity of the hit, 1 to 127. */
  intensity: number;
  /**
   * The General MIDI percussion number. The piece and the articulation come
   * from it, so a better map needs no new import.
   */
  midi: number;
}

/**
 * The drum part of an imported file, on the bar grid of the bass chart of
 * the same file. It has no tuning and no frets.
 */
export interface DrumChart {
  schemaVersion: 1;
  /** SHA-256 of the file hash and the part name. */
  id: string;
  /** A bass chart has no part field. */
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
  /** Ordered by time, then by MIDI number. */
  hits: DrumHit[];
}

/** One part of one imported file: a bass chart or a drum chart. */
export type Chart = BassChart | DrumChart;

export function isDrumChart(chart: Chart): chart is DrumChart {
  return 'part' in chart && chart.part === 'drums';
}
