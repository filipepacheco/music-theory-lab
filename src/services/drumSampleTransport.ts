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
  prepare(samples: DrumSampleId[]): Promise<void>;
  now(): number;
  schedule(hit: DrumPlaybackHit, when: number): void;
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
  let ringing = false;

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
    ringing = false;
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
      if (when >= now - LATE_SECONDS) voice.schedule(hit, when);
    }
    if (current >= duration) {
      stopTimer?.();
      stopTimer = null;
      ringing = true;
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
      if (state.playing || ringing) {
        voice.stop();
        ringing = false;
      }
      if (state.playing) startFrom(clamped);
      update({ currentSeconds: clamped });
    },
    dispose: () => {
      if (disposed) return;
      if (state.playing || ringing) halt();
      disposed = true;
    },
  };
}
