import { describe, expect, it } from 'vitest';
import { createTransport, type ClockAdapter } from '@/services/transport';
import { transcriptionDocument } from '@/domain/transcriptionDocument';
import type { Song } from '@/types';

/** A clock that only keeps its tempo: these tests check the tempo that plays. */
function createTempoClock(initialBpm: number) {
  let bpm = initialBpm;
  const clock: ClockAdapter = {
    resume: async () => {},
    start: () => {},
    stop: () => {},
    setBpm: (value) => {
      bpm = value;
    },
    getBpm: () => bpm,
    repeatQuarter: () => () => {},
    repeat: () => () => {},
    eighthSeconds: () => 30 / bpm,
    draw: () => {},
    click: () => {},
  };
  return clock;
}

const song: Song = {
  id: 'song-1',
  title: 'Garota',
  artist: 'Tom',
  key: 5,
  mode: 'minor',
  originalBpm: 120,
  presetId: 'rhodes',
  sections: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const SONG_OWNER = { kind: 'progression', id: '__song__' } as const;

describe('song playback tempo', () => {
  it('plays a song at its base tempo multiplied by the practice speed, not the app tempo', async () => {
    const clock = createTempoClock(100);
    const transport = createTransport(clock);
    const slow = transcriptionDocument.setPracticeSpeed(
      transcriptionDocument.load(song),
      50,
    );

    await transport.takeClock(SONG_OWNER, {
      onRelease: () => {},
      click: true,
      tempo: transcriptionDocument.playbackBpm(slow),
    });

    expect(clock.getBpm()).toBe(60);
    expect(slow.baseBpm).toBe(120);
  });

  it('many plays at a slow speed keep the same speed and the base tempo', async () => {
    const clock = createTempoClock(100);
    const transport = createTransport(clock);
    const slow = transcriptionDocument.setPracticeSpeed(
      transcriptionDocument.load(song),
      75,
    );

    for (let play = 0; play < 3; play++) {
      await transport.takeClock(SONG_OWNER, {
        onRelease: () => {},
        click: true,
        tempo: transcriptionDocument.playbackBpm(slow),
      });
      transport.releaseClock(SONG_OWNER.id);
      expect(clock.getBpm()).toBe(90);
    }

    expect(slow.baseBpm).toBe(120);
  });
});
