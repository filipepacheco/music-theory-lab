// Plays a drum chart through the drum samples when no recording is attached.
//
// The transport speaks the same session interface as the recording player,
// so the chart follows it the same way. Hits are handed to the voice a little
// ahead of time, pinned to the audio clock, as the bass transport does.

import {
  drumPlaybackHits,
  type DrumPlaybackHit,
  type DrumSampleId,
} from '@/domain/drumPlaybackSchedule';
import type { DrumChart } from '@/domain/drumChart';
import type {
  LibraryAudioSession,
  LibraryAudioState,
} from '@/services/libraryAudioSession';

const TICK_MS = 25;
const LOOKAHEAD_SECONDS = 0.2;
const START_DELAY_SECONDS = 0.05;
const LATE_SECONDS = 0.05;

export interface DrumSampleVoice {
  /** Resolves once the audio clock runs and these samples can sound. */
  prepare(samples: DrumSampleId[]): Promise<void>;
  /** Seconds on the audio clock. */
  now(): number;
  schedule(hit: DrumPlaybackHit, when: number): void;
  /** Silences sounding hits and cancels scheduled ones. */
  stop(): void;
}

export type DrumSampleTimer = (
  callback: () => void,
  milliseconds: number,
) => () => void;

const browserTimer: DrumSampleTimer = (callback, milliseconds) => {
  const id = setInterval(callback, milliseconds);
  return () => clearInterval(id);
};

export function createDrumSampleTransport(
  chart: Pick<DrumChart, 'hits' | 'songLengthSeconds'>,
  voice: DrumSampleVoice,
  onStateChange: (state: LibraryAudioState) => void,
  timer: DrumSampleTimer = browserTimer,
): LibraryAudioSession {
  const hits = drumPlaybackHits(chart.hits);
  const samples = [...new Set(hits.map((h) => h.sample))];
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
    const index = hits.findIndex((h) => h.time >= seconds);
    next = index < 0 ? hits.length : index;
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
      next < hits.length &&
      hits[next].time < current + LOOKAHEAD_SECONDS
    ) {
      const hit = hits[next];
      next += 1;
      const when = anchor.audioTime + (hit.time - anchor.position);
      // A throttled background tab wakes up late: what it missed is dropped.
      if (when >= now - LATE_SECONDS) voice.schedule(hit, when);
    }
    if (current >= duration) {
      // The end of the chart lets the scheduled hits ring out: only the timer
      // stops. Pause, seek, and dispose still silence the voice.
      stopTimer?.();
      stopTimer = null;
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
        await voice.prepare(samples);
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
