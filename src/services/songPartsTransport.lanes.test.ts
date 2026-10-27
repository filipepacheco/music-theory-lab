import { describe, expect, it } from 'vitest';
import { partsSounding, type PartMutes } from '@/domain/songPartsPlayback';
import {
  createSongPartsTransport,
  type SongPartsVoice,
} from '@/services/songPartsTransport';

const KEYS = ['bass', 'drums', 'g1', 'g2'];

function setup(mutes: PartMutes) {
  let clock = 0;
  let tick = () => {};
  const log: string[] = [];
  const stops: (string | undefined)[] = [];
  const voice: SongPartsVoice = {
    prepare: async () => {},
    now: () => clock,
    scheduleBass: (note) => log.push(`bass#${note.time}`),
    scheduleDrum: (hit) => log.push(`drums#${hit.time}`),
    scheduleLane: (key, event) => log.push(`${key}#${event.time}`),
    stop: (part) => stops.push(part),
  };
  const current = { mutes };
  const transport = createSongPartsTransport(
    {
      bass: [{ time: 0, midi: 40, seconds: 0.5 }],
      drums: [{ time: 0.1, sample: 'kick', rate: 1, gain: 1 }],
      lanes: [
        { key: 'g1', events: [{ time: 0.2 }] },
        { key: 'g2', events: [{ time: 0.3 }] },
      ],
      durationSeconds: 2,
    },
    voice,
    () =>
      partsSounding({
        open: 'bass',
        sameFile: true,
        recording: false,
        mutes: current.mutes,
        keys: KEYS,
      }),
    () => {},
    (callback) => {
      tick = callback;
      return () => {};
    },
  );
  return {
    transport,
    log,
    stops,
    current,
    advance: (to: number) => {
      clock = to;
      tick();
    },
  };
}

describe('song parts transport with many charts', () => {
  it('plays every chart on one clock', async () => {
    const t = setup({});
    await t.transport.play();
    t.advance(0.4);
    expect(t.log).toEqual(['bass#0', 'drums#0.1', 'g1#0.2', 'g2#0.3']);
  });

  it('a mute silences only its chart', async () => {
    const t = setup({ g1: true });
    await t.transport.play();
    t.advance(0.4);
    expect(t.log).toEqual(['bass#0', 'drums#0.1', 'g2#0.3']);
    t.current.mutes = { g1: true, g2: true };
    t.transport.muteChanged('g2');
    expect(t.stops).toEqual(['g2']);
  });
});
