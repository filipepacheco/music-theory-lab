export interface ProgressionStep {
  /** Index into harmonic field (0-6), or null for chromatic/custom chord */
  degree: number | null;
  /** Display label (roman numeral) */
  label: string;
  /** Semitone intervals from root - used when degree is null */
  intervals?: number[];
  /** Duration in quarter-note beats (default: 4 = one measure in 4/4) */
  beats?: number;
  /** Shift this chord change by N eighth notes. -1 = anticipation (bossa nova feel). Default: 0 */
  offsetEighths?: number;
  /** Confidence marker for transcription mode */
  confidence?: 'sure' | 'unsure';
}

export interface ProgressionExample {
  id: string;
  name: string;
  description: string;
  steps: ProgressionStep[];
  mode: "major" | "minor";
  /** Recommended tone preset */
  presetId: string;
  /** Recommended BPM for metronome sync */
  bpm: number;
}

export const PROGRESSION_EXAMPLES: ProgressionExample[] = [
  {
    id: "cadencia-basica",
    name: "Cadencia Basica",
    description:
      "I - IV - V - I: O fundamento de tudo. A dominante (V) cria tensao que resolve na tonica (I).",
    steps: [
      { degree: 0, label: "I" },
      { degree: 3, label: "IV" },
      { degree: 4, label: "V" },
      { degree: 0, label: "I" },
    ],
    mode: "major",
    presetId: "piano",
    bpm: 100,
  },
  {
    id: "pop",
    name: "Pop Universal",
    description:
      "I - V - vi - IV: A progressao mais famosa do pop. Let It Be, No Woman No Cry, Ai Se Eu Te Pego.",
    steps: [
      { degree: 0, label: "I" },
      { degree: 4, label: "V" },
      { degree: 5, label: "vi" },
      { degree: 3, label: "IV" },
    ],
    mode: "major",
    presetId: "piano",
    bpm: 110,
  },
  {
    id: "ii-v-i",
    name: "Jazz / Bossa Nova",
    description:
      "ii - V - I: A espinha dorsal do jazz e da bossa nova. Wave, Corcovado, Samba de Uma Nota So.",
    steps: [
      { degree: 1, label: "ii" },
      { degree: 4, label: "V" },
      { degree: 0, label: "I" },
    ],
    mode: "major",
    presetId: "rhodes",
    bpm: 120,
  },
  {
    id: "garota-de-ipanema",
    name: "Garota de Ipanema",
    description:
      "I - II7 - ii - V - iii: O II7 e dominante secundario (V7/V), fora do campo harmonico. Tom Jobim.",
    steps: [
      { degree: 0, label: "I"},
      { degree: 0, label: "I"},
      // II7: dominante secundario (V7/V) - fora do campo harmonico
      { degree: null, label: "II7", intervals: [2, 6, 9, 0], offsetEighths: -1},
      { degree: null, label: "II7", intervals: [2, 6, 9, 0]},
      { degree: 1, label: "ii", offsetEighths: -1 },
      { degree: 4, label: "V" },
      { degree: 2, label: "iii" },
      { degree: 2, label: "iii" },
    ],
    mode: "major",
    presetId: "rhodes",
    bpm: 140,
  },
  {
    id: "triste",
    name: "Balada / Triste",
    description:
      "vi - IV - I - V: Comeca na relativa menor, criando uma sonoridade melancolica antes de resolver.",
    steps: [
      { degree: 5, label: "vi" },
      { degree: 3, label: "IV" },
      { degree: 0, label: "I" },
      { degree: 4, label: "V" },
    ],
    mode: "major",
    presetId: "pad",
    bpm: 75,
  },
  {
    id: "menor-basica",
    name: "Cadencia Menor",
    description:
      "i - iv - v - i: A mesma logica da cadencia basica, mas no modo menor. Sente a diferenca de clima.",
    steps: [
      { degree: 0, label: "i" },
      { degree: 3, label: "iv" },
      { degree: 4, label: "v" },
      { degree: 0, label: "i" },
    ],
    mode: "minor",
    presetId: "piano",
    bpm: 90,
  },
  {
    id: "andaluza",
    name: "Cadencia Andaluza",
    description:
      "i - VII - VI - V: Descendente e dramatica. O V maior (da menor harmonica) cria a resolucao frigia caracteristica. Flamenco e rock.",
    steps: [
      { degree: 0, label: "i" },
      { degree: 6, label: "VII" },
      { degree: 5, label: "VI" },
      { degree: null, label: "V", intervals: [7, 11, 2] },
    ],
    mode: "minor",
    presetId: "nylon",
    bpm: 85,
  },
];
