import * as Tone from 'tone';
import { noteToToneString, ascendVoicing } from '@/utils/noteHelpers';
import {
  DEFAULT_PRESET_ID,
  PRESET_MAP,
  TONE_PRESETS,
} from '@/constants/tonePresets';
import type {
  TonePreset,
  SynthPreset,
  SamplerPreset,
} from '@/constants/tonePresets';
import type { DrumPiece } from '@/types';

export interface PlaybackEngine {
  playNote(
    noteIndex: number,
    octave: number,
    duration: string,
    presetId?: string,
  ): void;
  playChord(
    noteIndices: number[],
    octave: number,
    duration: string,
    presetId?: string,
    time?: number,
  ): void;
  playScale(noteIndices: number[], octave: number, presetId?: string): void;
  playGrooveHit(piece: DrumPiece, time: number): void;
  stopGroove(): void;
  stopAll(presetId?: string): void;
}

const limiter = new Tone.Limiter(-6).toDestination();
const reverb = new Tone.Reverb({ decay: 1.8, wet: 0.2 }).connect(limiter);

let audioStarted = false;
let audioStartPromise: Promise<boolean> | null = null;

export function ensureAudio(): Promise<boolean> {
  if (audioStarted) return Promise.resolve(true);
  if (audioStartPromise) return audioStartPromise;

  audioStartPromise = (async () => {
    try {
      await Tone.start();
      Tone.getContext().lookAhead = 0.01;
      audioStarted = true;
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    audioStartPromise = null;
  });

  return audioStartPromise;
}

interface SamplerEntry {
  sampler: Tone.Sampler;
  loaded: boolean;
}

const samplerCache = new Map<string, SamplerEntry>();

function loadSampler(preset: SamplerPreset): SamplerEntry {
  const existing = samplerCache.get(preset.id);
  if (existing) return existing;

  const entry: SamplerEntry = { sampler: null!, loaded: false };
  entry.sampler = new Tone.Sampler({
    urls: preset.urls,
    baseUrl: preset.baseUrl,
    release: preset.release,
    volume: preset.volume,
    onload: () => {
      entry.loaded = true;
    },
  }).connect(reverb);
  samplerCache.set(preset.id, entry);
  return entry;
}

for (const preset of TONE_PRESETS) {
  if (preset.type === 'sampler') loadSampler(preset);
}

function createSynth(preset: SynthPreset): Tone.PolySynth {
  return new Tone.PolySynth(Tone.Synth, {
    oscillator: preset.oscillator as unknown as Tone.OmniOscillatorOptions,
    envelope: preset.envelope,
    volume: preset.volume,
  }).connect(reverb);
}

function createFallbackSynth(preset: SamplerPreset): Tone.PolySynth {
  return new Tone.PolySynth(Tone.Synth, {
    oscillator:
      preset.fallbackOscillator as unknown as Tone.OmniOscillatorOptions,
    envelope: preset.fallbackEnvelope,
    volume: preset.volume,
  }).connect(reverb);
}

function resolvePreset(presetId?: string): TonePreset {
  return (
    PRESET_MAP[presetId ?? DEFAULT_PRESET_ID] ?? PRESET_MAP[DEFAULT_PRESET_ID]
  );
}

function voiceChord(noteIndices: number[], octave: number): string[] {
  return ascendVoicing(noteIndices, octave).map(
    ({ note, octave: noteOctave }) => noteToToneString(note, noteOctave),
  );
}

function getReadySampler(preset: TonePreset): Tone.Sampler | null {
  if (preset.type !== 'sampler') return null;
  const entry = loadSampler(preset);
  if (!entry.loaded) return null;
  reverb.wet.value = preset.reverbWet;
  return entry.sampler;
}

// Acoustic-leaning groove voices are shared for the lifetime of the module,
// just like the metronome clicks. They all pass through the existing effects
// chain, with filtered noise providing the skin and cymbal textures.
const grooveKick = new Tone.MembraneSynth({
  pitchDecay: 0.045,
  octaves: 4,
  envelope: { attack: 0.001, decay: 0.36, sustain: 0, release: 0.08 },
  volume: -4,
}).connect(reverb);

const grooveSnareBody = new Tone.MembraneSynth({
  pitchDecay: 0.012,
  octaves: 2,
  envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.06 },
  volume: -16,
}).connect(reverb);

const grooveSnareFilter = new Tone.Filter({
  type: 'highpass',
  frequency: 900,
  rolloff: -12,
}).connect(reverb);

const grooveSnare = new Tone.NoiseSynth({
  noise: { type: 'pink' },
  envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.08 },
  volume: -12,
}).connect(grooveSnareFilter);

const grooveHiHatFilter = new Tone.Filter({
  type: 'highpass',
  frequency: 5500,
  rolloff: -12,
}).connect(reverb);

const grooveHiHat = new Tone.NoiseSynth({
  noise: { type: 'white' },
  envelope: { attack: 0.001, decay: 0.065, sustain: 0, release: 0.04 },
  volume: -16,
}).connect(grooveHiHatFilter);

interface GrooveSample {
  player: Tone.Player;
  ready: Promise<boolean>;
}

// These are the acoustic-kit one-shot recordings used by the Tone.js audio
// examples. They are cached once and still pass through the app's reverb and
// limiter rather than creating a separate destination path.
const GROOVE_SAMPLE_BASE_URL =
  'https://tonejs.github.io/audio/drum-samples/acoustic-kit/';

function createGrooveSample(filename: string, volume: number): GrooveSample {
  let resolveReady: (loaded: boolean) => void = () => {};
  const ready = new Promise<boolean>((resolve) => {
    resolveReady = resolve;
  });
  const player = new Tone.Player({
    url: `${GROOVE_SAMPLE_BASE_URL}${filename}`,
    volume,
    fadeOut: 0.015,
    onload: () => resolveReady(true),
    onerror: () => resolveReady(false),
  }).connect(reverb);
  return { player, ready };
}

const grooveSamples: Record<DrumPiece, GrooveSample> = {
  bumbo: createGrooveSample('kick.mp3', -3),
  caixa: createGrooveSample('snare.mp3', -6),
  chimbal: createGrooveSample('hihat.mp3', -12),
};

const grooveSamplesReady = Promise.all(
  Object.values(grooveSamples).map((sample) => sample.ready),
).then((results) => results.every(Boolean));

export function ensureGrooveSamples(): Promise<boolean> {
  return grooveSamplesReady;
}

function playGrooveSample(piece: DrumPiece, time: number): boolean {
  const sample = grooveSamples[piece];
  if (!sample.player.loaded) return false;
  sample.player.start(time);
  return true;
}

function stopGrooveSources() {
  for (const sample of Object.values(grooveSamples)) {
    sample.player.stop();
  }
  grooveKick.triggerRelease();
  grooveSnareBody.triggerRelease();
  grooveSnare.triggerRelease();
  grooveHiHat.triggerRelease();
}

export function createPlaybackEngine(): PlaybackEngine {
  let noteSynth: Tone.PolySynth | null = null;
  let notePresetId: string | null = null;
  const chordSynths: Tone.PolySynth[] = [];

  function getOrCreateNoteSynth(preset: TonePreset): Tone.PolySynth {
    const cacheKey =
      preset.type === 'synth' ? preset.id : `${preset.id}__fallback`;
    if (noteSynth && notePresetId === cacheKey) return noteSynth;

    noteSynth?.releaseAll();
    noteSynth?.dispose();
    reverb.wet.value = preset.reverbWet;
    noteSynth =
      preset.type === 'synth'
        ? createSynth(preset)
        : createFallbackSynth(preset);
    notePresetId = cacheKey;
    return noteSynth;
  }

  return {
    playNote: (noteIndex, octave, duration, presetId) => {
      void ensureAudio();
      const note = noteToToneString(noteIndex, octave);
      const preset = resolvePreset(presetId);
      const sampler = getReadySampler(preset);
      if (sampler) {
        sampler.triggerAttackRelease(note, duration);
        return;
      }
      getOrCreateNoteSynth(preset).triggerAttackRelease(note, duration);
    },

    playChord: (noteIndices, octave, duration, presetId, time) => {
      void ensureAudio();
      const voiced = voiceChord(noteIndices, octave);
      const preset = resolvePreset(presetId);
      const sampler = getReadySampler(preset);
      if (sampler) {
        if (time === undefined) sampler.releaseAll();
        sampler.triggerAttackRelease(voiced, duration, time);
        return;
      }

      for (const old of chordSynths) {
        old.releaseAll();
        setTimeout(() => old.dispose(), 2000);
      }
      chordSynths.length = 0;
      reverb.wet.value = preset.reverbWet;
      const synth =
        preset.type === 'synth'
          ? createSynth(preset)
          : createFallbackSynth(preset);
      chordSynths.push(synth);
      synth.triggerAttackRelease(voiced, duration, time);
    },

    playScale: (noteIndices, octave, presetId) => {
      void ensureAudio();
      const preset = resolvePreset(presetId);
      const sampler = getReadySampler(preset);
      const now = Tone.now();
      if (sampler) {
        noteIndices.forEach((note, index) => {
          sampler.triggerAttackRelease(
            noteToToneString(note, octave),
            '8n',
            now + index * 0.3,
          );
        });
        return;
      }

      const synth = getOrCreateNoteSynth(preset);
      noteIndices.forEach((note, index) => {
        synth.triggerAttackRelease(
          noteToToneString(note, octave),
          '8n',
          now + index * 0.3,
        );
      });
    },

    playGrooveHit: (piece, time) => {
      void ensureAudio();

      if (playGrooveSample(piece, time)) return;

      switch (piece) {
        case 'bumbo':
          grooveKick.triggerAttackRelease('D2', 0.36, time);
          break;
        case 'caixa':
          grooveSnareBody.triggerAttackRelease('A2', 0.18, time);
          grooveSnare.triggerAttackRelease(0.2, time);
          break;
        case 'chimbal':
          grooveHiHat.triggerAttackRelease(0.03, time);
          break;
      }
    },

    stopGroove: () => {
      stopGrooveSources();
    },

    stopAll: (presetId) => {
      const preset = resolvePreset(presetId);
      getReadySampler(preset)?.releaseAll();
      noteSynth?.releaseAll();
      for (const synth of chordSynths) synth.releaseAll();
      stopGrooveSources();
    },
  };
}

export const playbackEngine = createPlaybackEngine();
