import { describe, expect, it } from 'vitest';
import type { LibraryAudioState } from '@/services/libraryAudioSession';
import {
  createSongPartsTransport,
  type SongPartsVoice,
} from '@/services/songPartsTransport';
import {
  NO_MUTES,
  partsSounding,
  type PartMutes,
  type PlaybackPart,
} from '@/domain/songPartsPlayback';

function setup(
  mutes: PartMutes = NO_MUTES,
  bassNotes?: number[],
  drumTimes?: number[],
) {
  let clock = 0;
  const log: string[] = [];
  const stops: (PlaybackPart | undefined)[] = [];
  let tick = () => {};
  const voice: SongPartsVoice = {
    prepare: async () => {},
    now: () => clock,
    scheduleBass: (note, when) =>
      log.push(`bass@${when.toFixed(2)}#${note.time}`),
    scheduleDrum: (hit, when) =>
      log.push(`drums@${when.toFixed(2)}#${hit.time}`),
    stop: (part) => stops.push(part),
  };
  const state: { current?: LibraryAudioState } = {};
  const current = { mutes };
  const transport = createSongPartsTransport(
    {
      bass: (bassNotes ?? [0, 1]).map((time) => ({
        time,
        midi: 40,
        seconds: 0.5,
      })),
      drums: (drumTimes ?? [0, 0.5, 1]).map((time) => ({
        time,
        sample: 'kick' as const,
        rate: 1,
        gain: 1,
      })),
      durationSeconds: 3,
    },
    voice,
    () =>
      partsSounding({
        open: 'bass',
        sameFile: true,
        recording: false,
        mutes: current.mutes,
      }),
    (s) => (state.current = s),
    (cb) => {
      tick = cb;
      return () => {};
    },
  );
  return {
    transport,
    log,
    stops,
    state,
    current,
    advance: (to: number) => {
      clock = to;
      tick();
    },
  };
}

describe('createSongPartsTransport', () => {
  it('starts the two parts on one clock', async () => {
    const t = setup();
    await t.transport.play();
    t.advance(0.6);
    expect(t.log).toContain('bass@0.05#0');
    expect(t.log).toContain('drums@0.05#0');
    expect(t.log).toContain('drums@0.55#0.5');
  });

  it('a mute silences its part and the other part goes on', async () => {
    const t = setup({ bass: true, drums: false });
    await t.transport.play();
    for (const at of [0.2, 0.5, 0.8, 1.1]) t.advance(at);
    expect(t.log.some((l) => l.startsWith('bass'))).toBe(false);
    expect(t.log.filter((l) => l.startsWith('drums'))).toHaveLength(3);
    t.current.mutes = { bass: true, drums: true };
    t.transport.muteChanged('drums');
    expect(t.stops).toEqual(['drums']);
    expect(t.state.current?.playing).toBe(true);
  });

  it('stays in time after a click on a bar', async () => {
    const t = setup();
    await t.transport.play();
    t.advance(0.3);
    t.log.length = 0;
    t.transport.seek(1);
    expect(t.stops).toContain(undefined);
    t.advance(0.3);
    expect(t.log).toContain('bass@0.35#1');
    expect(t.log).toContain('drums@0.35#1');
    expect(t.log.some((l) => l.endsWith('#0.5'))).toBe(false);
  });

  it('keeps a bass note and a drum hit on one beat together after a tempo change', async () => {
    const t = setup(NO_MUTES, [0, 2, 3], [0, 2, 3]);
    await t.transport.play();
    for (const at of [0.5, 1.2, 1.9, 2.2, 2.9, 3.1]) t.advance(at);
    const whenOf = (part: string, time: number) =>
      t.log.find((l) => l.startsWith(part) && l.endsWith(`#${time}`));
    expect(whenOf('bass', 3)).toBe('bass@3.05#3');
    expect(whenOf('drums', 3)).toBe('drums@3.05#3');
    expect(t.log.some((l) => l.includes('@2.55'))).toBe(false);
  });

  it('silences a ringing crash on dispose or seek after the end', async () => {
    for (const leave of ['dispose', 'seek'] as const) {
      const t = setup();
      await t.transport.play();
      t.advance(5);
      expect(t.stops).toEqual([]);
      if (leave === 'dispose') t.transport.dispose();
      else t.transport.seek(1);
      expect(t.stops).toEqual([undefined]);
    }
  });

  it('does not stop the voice at the end of the chart', async () => {
    const t = setup();
    await t.transport.play();
    t.advance(1);
    t.advance(5);
    expect(t.state.current).toMatchObject({ playing: false });
    expect(t.stops).toEqual([]);
  });
});
