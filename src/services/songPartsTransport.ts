// Plays the bass part and the drum part of one file on one clock.
//
// It speaks the session interface of the recording player. Each part reads its
// events from one timeline, so a seek or a change of tempo in the chart moves
// both. A mute decides at the moment of scheduling and silences only its part.

import type {
  DrumPlaybackHit,
  DrumSampleId,
} from '@/domain/drumPlaybackSchedule';
import {
  partsTimeline,
  type PartMutes,
  type PlaybackPart,
} from '@/domain/songPartsPlayback';
import type {
  LibraryAudioSession,
  LibraryAudioState,
} from '@/services/libraryAudioSession';
import type { BassSynthNote } from '@/services/bassSynthTransport';

const TICK_MS = 25;
const LOOKAHEAD_SECONDS = 0.2;
const START_DELAY_SECONDS = 0.05;
const LATE_SECONDS = 0.05;

export interface SongPartsVoice {
  /** Resolves once the audio clock runs and these sounds can play. */
  prepare(bassMidi: number[], samples: DrumSampleId[]): Promise<void>;
  now(): number;
  scheduleBass(note: BassSynthNote, when: number): void;
  scheduleDrum(hit: DrumPlaybackHit, when: number): void;
  /** Silences one part, or both, and cancels what was scheduled. */
  stop(part?: PlaybackPart): void;
}

export type SongPartsTimer = (
  callback: () => void,
  milliseconds: number,
) => () => void;

const browserTimer: SongPartsTimer = (callback, milliseconds) => {
  const id = setInterval(callback, milliseconds);
  return () => clearInterval(id);
};

export interface SongPartsSession extends LibraryAudioSession {
  /** The mutes changed: the muted part goes silent at once. */
  muteChanged(part: PlaybackPart): void;
}

export function createSongPartsTransport(
  parts: {
    bass: BassSynthNote[];
    drums: DrumPlaybackHit[];
    durationSeconds: number;
  },
  voice: SongPartsVoice,
  /** Which parts sound now; read at each scheduling, so a mute is live. */
  sounding: () => PartMutes,
  onStateChange: (state: LibraryAudioState) => void,
  timer: SongPartsTimer = browserTimer,
): SongPartsSession {
  const events = partsTimeline(parts.bass, parts.drums);
  const pitches = [...new Set(parts.bass.map((n) => n.midi))];
  const samples = [...new Set(parts.drums.map((h) => h.sample))];
  const duration = parts.durationSeconds;
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
    const index = events.findIndex((e) => e.time >= seconds);
    next = index < 0 ? events.length : index;
  };
  const halt = () => {
    stopTimer?.();
    stopTimer = null;
    voice.stop();
  };
  const tick = () => {
    const now = voice.now();
    const current = position();
    const audible = sounding();
    while (
      next < events.length &&
      events[next].time < current + LOOKAHEAD_SECONDS
    ) {
      const event = events[next];
      next += 1;
      const when = anchor.audioTime + (event.time - anchor.position);
      // A silent part is skipped; a throttled tab drops what it missed.
      if (!audible[event.part] || when < now - LATE_SECONDS) continue;
      if (event.part === 'bass') voice.scheduleBass(event.note, when);
      else voice.scheduleDrum(event.hit, when);
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
        await voice.prepare(pitches, samples);
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
    muteChanged: (part) => {
      if (state.playing && !sounding()[part]) voice.stop(part);
    },
    dispose: () => {
      if (disposed) return;
      if (state.playing) halt();
      disposed = true;
    },
  };
}
