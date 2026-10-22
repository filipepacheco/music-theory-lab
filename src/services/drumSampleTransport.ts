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
import {
  createSongPartsTransport,
  type SongPartsTimer,
} from '@/services/songPartsTransport';

export interface DrumSampleVoice {
  prepare(samples: DrumSampleId[]): Promise<void>;
  now(): number;
  schedule(hit: DrumPlaybackHit, when: number): void;
  stop(): void;
}

export type DrumSampleTimer = SongPartsTimer;

const ALL_SOUNDING = { bass: true, drums: true };

/** A drum chart alone: the song-parts transport with no bass part. */
export function createDrumSampleTransport(
  chart: Pick<DrumChart, 'hits' | 'songLengthSeconds'>,
  voice: DrumSampleVoice,
  onStateChange: (state: LibraryAudioState) => void,
  timer?: DrumSampleTimer,
): LibraryAudioSession {
  return createSongPartsTransport(
    {
      bass: [],
      drums: drumPlaybackHits(chart.hits),
      durationSeconds: chart.songLengthSeconds,
    },
    {
      prepare: (_bassMidi, samples) => voice.prepare(samples),
      now: () => voice.now(),
      scheduleBass: () => {},
      scheduleDrum: (hit, when) => voice.schedule(hit, when),
      stop: () => voice.stop(),
    },
    () => ALL_SOUNDING,
    onStateChange,
    timer,
  );
}
