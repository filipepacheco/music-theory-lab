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
  stopAll(presetId?: string): void;
}

const limiter = new Tone.Limiter(-6).toDestination();
const reverb = new Tone.Reverb({ decay: 1.8, wet: 0.2 }).connect(limiter);

let audioStarted = false;

async function ensureAudio() {
  if (audioStarted) return;
  audioStarted = true;
  try {
    await Tone.start();
    Tone.getContext().lookAhead = 0.01;
  } catch {
    audioStarted = false;
  }
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

    stopAll: (presetId) => {
      const preset = resolvePreset(presetId);
      getReadySampler(preset)?.releaseAll();
      noteSynth?.releaseAll();
      for (const synth of chordSynths) synth.releaseAll();
    },
  };
}

export const playbackEngine = createPlaybackEngine();
