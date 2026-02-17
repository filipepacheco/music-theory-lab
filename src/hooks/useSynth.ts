import { useRef, useCallback } from "react";
import * as Tone from "tone";
import { noteToToneString } from "@/utils/noteHelpers";
import { PRESET_MAP, DEFAULT_PRESET_ID } from "@/constants/tonePresets";
import type {
  TonePreset,
  SynthPreset,
  SamplerPreset,
} from "@/constants/tonePresets";
import { useAppStore } from "@/store/useAppStore";

// --- Shared effects chain ---

const limiter = new Tone.Limiter(-6).toDestination();
const reverb = new Tone.Reverb({ decay: 1.8, wet: 0.2 }).connect(limiter);

// --- Audio context ---

let audioStarted = false;
async function ensureAudio() {
  if (audioStarted) return;
  audioStarted = true;
  try {
    await Tone.start();
    // Reduce lookAhead for low-latency interactive playback (default 0.1s)
    Tone.getContext().lookAhead = 0.01;
  } catch {
    audioStarted = false;
  }
}

// --- Sampler cache (shared across all hook instances) ---

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

// Eagerly start loading all sampler presets
import { TONE_PRESETS } from "@/constants/tonePresets";
for (const preset of TONE_PRESETS) {
  if (preset.type === "sampler") {
    loadSampler(preset);
  }
}

// --- Synth factories ---

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

// --- Voicing ---

function voiceChord(noteIndices: number[], octave: number): string[] {
  const voiced: string[] = [];
  let currentOctave = octave;
  let prevSemitone = -1;
  for (const n of noteIndices) {
    if (n <= prevSemitone) {
      currentOctave++;
    }
    voiced.push(noteToToneString(n, currentOctave));
    prevSemitone = n;
  }
  return voiced;
}

// --- Helpers ---

function resolvePreset(presetId?: string): TonePreset {
  const id =
    presetId ?? useAppStore.getState().activePresetId ?? DEFAULT_PRESET_ID;
  return PRESET_MAP[id] ?? PRESET_MAP[DEFAULT_PRESET_ID];
}

/** Returns a loaded Sampler if preset is sampler-type and samples are ready, else null. */
function getReadySampler(preset: TonePreset): Tone.Sampler | null {
  if (preset.type !== "sampler") return null;
  const entry = loadSampler(preset);
  if (!entry.loaded) return null;
  reverb.wet.value = preset.reverbWet;
  return entry.sampler;
}

// --- Hook ---

export function useSynth() {
  // PolySynth for note playback (reused per preset, synth path only)
  const noteSynthRef = useRef<Tone.PolySynth | null>(null);
  const notePresetIdRef = useRef<string | null>(null);
  // Fresh PolySynths for chord playback (synth path only)
  const chordSynthsRef = useRef<Tone.PolySynth[]>([]);

  /** Get or create a PolySynth for individual note playback. */
  function getOrCreateNoteSynth(preset: TonePreset): Tone.PolySynth {
    const cacheKey =
      preset.type === "synth" ? preset.id : preset.id + "__fallback";

    if (noteSynthRef.current && notePresetIdRef.current === cacheKey) {
      return noteSynthRef.current;
    }

    noteSynthRef.current?.releaseAll();
    noteSynthRef.current?.dispose();
    reverb.wet.value = preset.reverbWet;

    noteSynthRef.current =
      preset.type === "synth"
        ? createSynth(preset)
        : createFallbackSynth(preset);
    notePresetIdRef.current = cacheKey;
    return noteSynthRef.current;
  }

  const playNote = useCallback(
    (noteIndex: number, octave: number = 4, duration: string = "8n") => {
      ensureAudio();
      const note = noteToToneString(noteIndex, octave);
      const preset = resolvePreset();

      // Sampler path (samples loaded)
      const sampler = getReadySampler(preset);
      if (sampler) {
        sampler.triggerAttackRelease(note, duration);
        return;
      }

      // Synth path (or sampler fallback while loading)
      const synth = getOrCreateNoteSynth(preset);
      synth.triggerAttackRelease(note, duration);
    },
    [],
  );

  const playChord = useCallback(
    (
      noteIndices: number[],
      octave: number = 3,
      duration: string = "2n",
      presetId?: string,
      time?: number,
    ) => {
      ensureAudio();
      const voiced = voiceChord(noteIndices, octave);
      const preset = resolvePreset(presetId);

      // Sampler path (samples loaded)
      const sampler = getReadySampler(preset);
      if (sampler) {
        // Release previous chord for clean transition (skip if Transport-scheduled)
        if (!time) sampler.releaseAll();
        sampler.triggerAttackRelease(voiced, duration, time);
        return;
      }

      // Synth path: fresh PolySynth per chord to avoid polyphony issues
      for (const old of chordSynthsRef.current) {
        old.releaseAll();
        setTimeout(() => old.dispose(), 2000);
      }
      chordSynthsRef.current = [];

      reverb.wet.value = preset.reverbWet;
      const synth =
        preset.type === "synth"
          ? createSynth(preset)
          : createFallbackSynth(preset);
      chordSynthsRef.current.push(synth);
      synth.triggerAttackRelease(voiced, duration, time);
    },
    [],
  );

  const playScale = useCallback(
    (noteIndices: number[], octave: number = 4) => {
      ensureAudio();
      const preset = resolvePreset();

      const sampler = getReadySampler(preset);
      if (sampler) {
        const now = Tone.now();
        noteIndices.forEach((n, i) => {
          sampler.triggerAttackRelease(
            noteToToneString(n, octave),
            "8n",
            now + i * 0.3,
          );
        });
        return;
      }

      const synth = getOrCreateNoteSynth(preset);
      const now = Tone.now();
      noteIndices.forEach((n, i) => {
        synth.triggerAttackRelease(
          noteToToneString(n, octave),
          "8n",
          now + i * 0.3,
        );
      });
    },
    [],
  );

  const stopAll = useCallback(() => {
    // Stop sampler if active
    const preset = resolvePreset();
    const sampler = getReadySampler(preset);
    if (sampler) sampler.releaseAll();

    // Stop synths
    noteSynthRef.current?.releaseAll();
    for (const s of chordSynthsRef.current) {
      s.releaseAll();
    }
  }, []);

  return { playNote, playChord, playScale, stopAll };
}
