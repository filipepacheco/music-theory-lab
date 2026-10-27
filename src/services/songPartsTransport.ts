import type {
  DrumPlaybackHit,
  DrumSampleId,
} from '@/domain/drumPlaybackSchedule';
import {
  partsLaneTimeline,
  type PartLane,
  type PartMutes,
  type PlaybackPart,
} from '@/domain/songPartsPlayback';
import type {
  LibraryAudioSession,
  LibraryAudioState,
} from '@/services/libraryAudioSession';
import type { BassSynthNote } from '@/services/bassSynthTransport';

const TICK_MS = 25;
const LOOKAHEAD_SECONDS = 0.5;
const START_DELAY_SECONDS = 0.05;
const LATE_SECONDS = 0.05;

export interface SongPartsVoice {
  prepare(bassMidi: number[], samples: DrumSampleId[]): Promise<void>;
  now(): number;
  scheduleBass(note: BassSynthNote, when: number): void;
  scheduleDrum(hit: DrumPlaybackHit, when: number): void;
  /** One event of a chart other than bass and drums, by its mute key. */
  scheduleLane?(key: PlaybackPart, event: { time: number }, when: number): void;
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
  muteChanged(part: PlaybackPart): void;
}

export function createSongPartsTransport(
  parts: {
    bass: BassSynthNote[];
    drums: DrumPlaybackHit[];
    /** Any number of other charts on the same clock. */
    lanes?: PartLane<{ time: number }>[];
    durationSeconds: number;
  },
  voice: SongPartsVoice,
  sounding: () => PartMutes,
  onStateChange: (state: LibraryAudioState) => void,
  timer: SongPartsTimer = browserTimer,
): SongPartsSession {
  const events = partsLaneTimeline(
    parts.bass,
    parts.drums,
    parts.lanes ?? [],
  );
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
  // One preparation at a time; a pause while it runs cancels the start.
  let preparing: Promise<void> | null = null;
  let wantsPlay = false;
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
    const index = events.findIndex((e) => e.time >= seconds);
    next = index < 0 ? events.length : index;
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
    const audible = sounding();
    while (
      next < events.length &&
      events[next].time < current + LOOKAHEAD_SECONDS
    ) {
      const event = events[next];
      next += 1;
      const when = anchor.audioTime + (event.time - anchor.position);
      if (!audible[event.key] || when < now - LATE_SECONDS) continue;
      if (event.part === 'bass') voice.scheduleBass(event.note, when);
      else if (event.part === 'drums') voice.scheduleDrum(event.hit, when);
      else voice.scheduleLane?.(event.key, event.event, when);
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
      if (disposed || state.playing) return;
      wantsPlay = true;
      preparing ??= voice.prepare(pitches, samples).finally(() => {
        preparing = null;
      });
      await preparing;
      if (disposed || !wantsPlay || state.playing) return;
      wantsPlay = false;
      startFrom(state.currentSeconds >= duration ? 0 : state.currentSeconds);
      update({ playing: true, currentSeconds: anchor.position });
      tick();
      stopTimer = timer(tick, TICK_MS);
    },
    pause: () => {
      wantsPlay = false;
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
    muteChanged: (part) => {
      if (state.playing && !sounding()[part]) voice.stop(part);
    },
    dispose: () => {
      if (disposed) return;
      if (state.playing || ringing) halt();
      disposed = true;
    },
  };
}
