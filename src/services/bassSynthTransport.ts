// Plays a bass chart through the sampled bass when no recording is attached.
//
// The transport speaks the same session interface as the recording player,
// so the chart follows it the same way. Notes are handed to the voice a
// little ahead of time, pinned to the audio clock, so their timing does not
// depend on how punctually the scheduler timer fires.

import type { BassChart, BassChartNote } from '@/domain/bassChart';
import type {
  LibraryAudioSession,
  LibraryAudioState,
} from '@/services/libraryAudioSession';
import {
  GROWLYBASS_HIGHEST_MIDI,
  GROWLYBASS_LOWEST_MIDI,
} from '@/utils/growlybass';

const TICK_MS = 25;
const LOOKAHEAD_SECONDS = 0.2;
/** Head start so the first note is scheduled before it is due. */
const START_DELAY_SECONDS = 0.05;
/** How late a note may be handed over and still be worth playing. */
const LATE_SECONDS = 0.05;
const MIN_NOTE_SECONDS = 0.08;
const MUTED_NOTE_SECONDS = 0.06;

export interface BassSynthNote {
  /** Seconds from the start of the chart. */
  time: number;
  /** Pitch folded into the range the sampled bass covers. */
  midi: number;
  seconds: number;
}

export interface BassSynthVoice {
  /** Resolves once the audio clock runs and these pitches can sound. */
  prepare(midiNotes: number[]): Promise<void>;
  /** Seconds on the audio clock. */
  now(): number;
  schedule(note: BassSynthNote, when: number): void;
  /** Silences sounding notes and cancels scheduled ones. */
  stop(): void;
}

/** Calls `callback` every `milliseconds`; returns how to stop. */
export type BassSynthTimer = (
  callback: () => void,
  milliseconds: number,
) => () => void;

const browserTimer: BassSynthTimer = (callback, milliseconds) => {
  const id = setInterval(callback, milliseconds);
  return () => clearInterval(id);
};

/**
 * What the synth plays for each chart note. A note lasts its sustain, or as
 * long as the chart shows it when it has none, and never runs into the next
 * onset: a bass line is one voice. Dead notes are a short thud.
 */
export function bassSynthNotes(notes: BassChartNote[]): BassSynthNote[] {
  const result: BassSynthNote[] = [];
  let nextOnset = Infinity;
  for (let i = notes.length - 1; i >= 0; i -= 1) {
    const note = notes[i];
    const written = note.sustain > 0 ? note.sustain : note.endTime - note.time;
    const seconds = note.techniques.includes('mute')
      ? MUTED_NOTE_SECONDS
      : Math.max(MIN_NOTE_SECONDS, Math.min(written, nextOnset - note.time));
    let midi = note.midi;
    while (midi < GROWLYBASS_LOWEST_MIDI) midi += 12;
    while (midi > GROWLYBASS_HIGHEST_MIDI) midi -= 12;
    result.unshift({ time: note.time, midi, seconds });
    if (i === 0 || notes[i - 1].time < note.time) nextOnset = note.time;
  }
  return result;
}

export function createBassSynthTransport(
  chart: Pick<BassChart, 'notes' | 'songLengthSeconds'>,
  voice: BassSynthVoice,
  onStateChange: (state: LibraryAudioState) => void,
  timer: BassSynthTimer = browserTimer,
): LibraryAudioSession {
  const notes = bassSynthNotes(chart.notes);
  const pitches = [...new Set(notes.map((n) => n.midi))];
  const duration = chart.songLengthSeconds;
  let state: LibraryAudioState = {
    ready: true,
    playing: false,
    currentSeconds: 0,
    duration,
  };
  let disposed = false;
  let starting = false;
  let stopTimer: (() => void) | null = null;
  /** Chart position `position` sounds at `audioTime` on the audio clock. */
  let anchor = { audioTime: 0, position: 0 };
  let next = 0;

  const update = (change: Partial<LibraryAudioState>) => {
    if (disposed) return;
    state = { ...state, ...change };
    onStateChange(state);
  };
  const position = () =>
    Math.min(
      duration,
      anchor.position + Math.max(0, voice.now() - anchor.audioTime),
    );
  const startFrom = (seconds: number) => {
    anchor = {
      audioTime: voice.now() + START_DELAY_SECONDS,
      position: seconds,
    };
    const index = notes.findIndex((n) => n.time >= seconds);
    next = index < 0 ? notes.length : index;
  };
  const halt = () => {
    stopTimer?.();
    stopTimer = null;
    voice.stop();
  };
  const tick = () => {
    const now = voice.now();
    const current = position();
    while (
      next < notes.length &&
      notes[next].time < current + LOOKAHEAD_SECONDS
    ) {
      const note = notes[next];
      next += 1;
      const when = anchor.audioTime + (note.time - anchor.position);
      // A throttled background tab wakes up late: what it missed is dropped
      // rather than played in a burst.
      if (when >= now - LATE_SECONDS) voice.schedule(note, when);
    }
    if (current >= duration) {
      halt();
      update({ playing: false, currentSeconds: duration });
      return;
    }
    update({ currentSeconds: current });
  };

  onStateChange(state);

  return {
    play: async () => {
      if (disposed || state.playing || starting) return;
      starting = true;
      try {
        await voice.prepare(pitches);
      } finally {
        starting = false;
      }
      if (disposed) return;
      startFrom(state.currentSeconds >= duration ? 0 : state.currentSeconds);
      update({ playing: true, currentSeconds: anchor.position });
      tick();
      stopTimer = timer(tick, TICK_MS);
    },
    pause: () => {
      if (!state.playing) return;
      const at = position();
      halt();
      update({ playing: false, currentSeconds: at });
    },
    seek: (seconds) => {
      const clamped = Math.max(0, Math.min(seconds, duration));
      if (state.playing) {
        voice.stop();
        startFrom(clamped);
      }
      update({ currentSeconds: clamped });
    },
    dispose: () => {
      if (disposed) return;
      if (state.playing) halt();
      disposed = true;
    },
  };
}
