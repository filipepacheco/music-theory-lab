// --- Base types ---

interface BasePreset {
  id: string;
  name: string;
  description: string;
  volume: number;
  reverbWet: number;
}

export interface SynthPreset extends BasePreset {
  type: "synth";
  oscillator: Record<string, unknown>;
  envelope: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
}

export interface SamplerPreset extends BasePreset {
  type: "sampler";
  urls: Record<string, string>;
  baseUrl: string;
  release: number;
  /** Synth fallback while samples are still downloading */
  fallbackOscillator: Record<string, unknown>;
  fallbackEnvelope: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
}

export type TonePreset = SynthPreset | SamplerPreset;

// --- Sample URL maps ---

// Salamander Grand Piano (tonejs CDN) - sharps in filenames: Ds1, Fs1
const SALAMANDER_URLS: Record<string, string> = {
  A0: "A0.mp3",
  C1: "C1.mp3",
  "D#1": "Ds1.mp3",
  "F#1": "Fs1.mp3",
  A1: "A1.mp3",
  C2: "C2.mp3",
  "D#2": "Ds2.mp3",
  "F#2": "Fs2.mp3",
  A2: "A2.mp3",
  C3: "C3.mp3",
  "D#3": "Ds3.mp3",
  "F#3": "Fs3.mp3",
  A3: "A3.mp3",
  C4: "C4.mp3",
  "D#4": "Ds4.mp3",
  "F#4": "Fs4.mp3",
  A4: "A4.mp3",
  C5: "C5.mp3",
  "D#5": "Ds5.mp3",
  "F#5": "Fs5.mp3",
  A5: "A5.mp3",
  C6: "C6.mp3",
  "D#6": "Ds6.mp3",
  "F#6": "Fs6.mp3",
  A6: "A6.mp3",
  C7: "C7.mp3",
};

// FluidR3 GM soundfont (gleitz CDN) - flats in filenames: Db4, Eb4
// Sample every 3 semitones for good coverage with minimal download
function fluidUrls(instrument: string): { urls: Record<string, string>; baseUrl: string } {
  const notes: Record<string, string> = {
    A0: "A0.mp3",
    C1: "C1.mp3",
    Eb1: "Eb1.mp3",
    "F#1": "Gb1.mp3",
    A1: "A1.mp3",
    C2: "C2.mp3",
    Eb2: "Eb2.mp3",
    "F#2": "Gb2.mp3",
    A2: "A2.mp3",
    C3: "C3.mp3",
    Eb3: "Eb3.mp3",
    "F#3": "Gb3.mp3",
    A3: "A3.mp3",
    C4: "C4.mp3",
    Eb4: "Eb4.mp3",
    "F#4": "Gb4.mp3",
    A4: "A4.mp3",
    C5: "C5.mp3",
    Eb5: "Eb5.mp3",
    "F#5": "Gb5.mp3",
    A5: "A5.mp3",
    C6: "C6.mp3",
    Eb6: "Eb6.mp3",
    "F#6": "Gb6.mp3",
    A6: "A6.mp3",
    C7: "C7.mp3",
  };
  return {
    urls: notes,
    baseUrl: `https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/${instrument}-mp3/`,
  };
}

// --- Presets ---

const rhodesSamples = fluidUrls("electric_piano_1");
const nylonSamples = fluidUrls("acoustic_guitar_nylon");
const organSamples = fluidUrls("drawbar_organ");
const wurlitzerSamples = fluidUrls("electric_piano_2");
const padSamples = fluidUrls("pad_2_warm");

export const TONE_PRESETS: TonePreset[] = [
  {
    id: "piano",
    name: "Piano",
    description: "Piano acustico real (Salamander Grand)",
    type: "sampler",
    urls: SALAMANDER_URLS,
    baseUrl: "https://tonejs.github.io/audio/salamander/",
    release: 1,
    volume: 0,
    reverbWet: 0.2,
    fallbackOscillator: { type: "fmsine", modulationIndex: 3.5, harmonicity: 2 },
    fallbackEnvelope: { attack: 0.001, decay: 0.6, sustain: 0.1, release: 1.2 },
  },
  {
    id: "rhodes",
    name: "Rhodes",
    description: "Piano eletrico quente - Garota de Ipanema, bossa nova",
    type: "sampler",
    urls: rhodesSamples.urls,
    baseUrl: rhodesSamples.baseUrl,
    release: 1.5,
    volume: -2,
    reverbWet: 0.25,
    fallbackOscillator: { type: "fmsine", modulationIndex: 2.5, harmonicity: 3.01 },
    fallbackEnvelope: { attack: 0.008, decay: 1.2, sustain: 0.2, release: 2.0 },
  },
  {
    id: "nylon",
    name: "Violao Nylon",
    description: "Ataque percussivo e corpo redondo - MPB, samba",
    type: "sampler",
    urls: nylonSamples.urls,
    baseUrl: nylonSamples.baseUrl,
    release: 0.8,
    volume: -2,
    reverbWet: 0.15,
    fallbackOscillator: { type: "fmsine", modulationIndex: 1.5, harmonicity: 1.5 },
    fallbackEnvelope: { attack: 0.002, decay: 0.5, sustain: 0.05, release: 0.8 },
  },
  {
    id: "pad",
    name: "Pad Suave",
    description: "Som ambiente, etereo - baladas, progressoes lentas",
    type: "sampler",
    urls: padSamples.urls,
    baseUrl: padSamples.baseUrl,
    release: 3.0,
    volume: -4,
    reverbWet: 0.4,
    fallbackOscillator: { type: "fatsine", count: 5, spread: 25 },
    fallbackEnvelope: { attack: 0.3, decay: 0.5, sustain: 0.6, release: 3.0 },
  },
  {
    id: "organ",
    name: "Orgao",
    description: "Sustain continuo - rock classico, gospel",
    type: "sampler",
    urls: organSamples.urls,
    baseUrl: organSamples.baseUrl,
    release: 0.3,
    volume: -4,
    reverbWet: 0.15,
    fallbackOscillator: { type: "sine" },
    fallbackEnvelope: { attack: 0.05, decay: 0.1, sustain: 0.8, release: 0.3 },
  },
  {
    id: "wurlitzer",
    name: "Wurlitzer",
    description: "Piano eletrico com mais bite - soul, funk",
    type: "sampler",
    urls: wurlitzerSamples.urls,
    baseUrl: wurlitzerSamples.baseUrl,
    release: 1.0,
    volume: -2,
    reverbWet: 0.18,
    fallbackOscillator: { type: "fmsine", modulationIndex: 4, harmonicity: 2.01 },
    fallbackEnvelope: { attack: 0.003, decay: 0.6, sustain: 0.1, release: 1.0 },
  },
];

export const PRESET_MAP: Record<string, TonePreset> = Object.fromEntries(
  TONE_PRESETS.map((p) => [p.id, p]),
);

export const DEFAULT_PRESET_ID = "piano";
