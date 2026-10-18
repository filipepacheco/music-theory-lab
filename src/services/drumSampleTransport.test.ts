import { describe, expect, it, vi } from 'vitest';
import { fixtureDrumChart } from '@/domain/drumChartFixture';
import type { DrumPlaybackHit } from '@/domain/drumPlaybackSchedule';
import {
  createDrumSampleTransport,
  type DrumSampleVoice,
} from '@/services/drumSampleTransport';
import type { LibraryAudioState } from '@/services/libraryAudioSession';

const chart = () => ({
  ...fixtureDrumChart(2, [
    { bar: 0, beat: 0, midi: 36 },
    { bar: 0, beat: 2, midi: 38 },
    { bar: 0, beat: 3, midi: 80 },
    { bar: 1, beat: 0, midi: 36, dynamic: 'accent' as const },
  ]),
  songLengthSeconds: 4,
});

function harness() {
  let now = 10;
  let tick: (() => void) | null = null;
  const scheduled: { hit: DrumPlaybackHit; when: number }[] = [];
  const states: LibraryAudioState[] = [];
  const voice: DrumSampleVoice = {
    prepare: vi.fn(async () => {}),
    now: () => now,
    schedule: (hit, when) => scheduled.push({ hit, when }),
    stop: vi.fn(),
  };
  const transport = createDrumSampleTransport(
    chart(),
    voice,
    (s) => states.push(s),
    (cb) => {
      tick = cb;
      return () => {
        tick = null;
      };
    },
  );
  const advance = (seconds: number) => {
    now += seconds;
    tick?.();
  };
  return { transport, voice, scheduled, states, advance };
}

describe('createDrumSampleTransport', () => {
  it('prepares only the samples the chart uses', async () => {
    const { transport, voice } = harness();
    await transport.play();
    expect(voice.prepare).toHaveBeenCalledWith(['kick', 'snare']);
  });

  it('schedules each hit on the audio clock, ahead of its time', async () => {
    const { transport, scheduled, advance } = harness();
    await transport.play();
    expect(scheduled.map((s) => s.hit.sample)).toEqual(['kick']);
    expect(scheduled[0].when).toBeCloseTo(10.05);
    advance(1);
    expect(scheduled.map((s) => s.hit.sample)).toEqual(['kick', 'snare']);
    expect(scheduled[1].when).toBeCloseTo(11.05);
    advance(1);
    expect(scheduled.map((s) => s.hit.sample)).toEqual([
      'kick',
      'snare',
      'kick',
    ]);
    expect(scheduled[2].hit.gain).toBe(1);
  });

  it('plays from a seek to a bar and not the hits before it', async () => {
    const { transport, scheduled } = harness();
    transport.seek(2);
    await transport.play();
    expect(scheduled.map((s) => s.hit.time)).toEqual([2]);
  });

  it('cancels the sounding hits on pause and ends at the length', async () => {
    const { transport, voice, states, advance } = harness();
    await transport.play();
    advance(0.5);
    transport.pause();
    expect(voice.stop).toHaveBeenCalled();
    expect(states[states.length - 1]?.playing).toBe(false);
    await transport.play();
    advance(5);
    expect(states[states.length - 1]).toMatchObject({
      playing: false,
      currentSeconds: 4,
    });
  });

  it('lets the last hits ring out at the end of the chart', async () => {
    const { transport, voice, advance } = harness();
    await transport.play();
    advance(5);
    expect(voice.stop).not.toHaveBeenCalled();
  });

  it('silences a ringing hit on dispose or seek after the end', async () => {
    for (const leave of ['dispose', 'seek'] as const) {
      const { transport, voice, advance } = harness();
      await transport.play();
      advance(5);
      expect(voice.stop).not.toHaveBeenCalled();
      if (leave === 'dispose') transport.dispose();
      else transport.seek(1);
      expect(voice.stop).toHaveBeenCalledTimes(1);
    }
  });

  it('a seek while playing stops the voice, then schedules only the hits from the seek', async () => {
    const { transport, voice, scheduled, advance } = harness();
    await transport.play();
    advance(0.1);
    scheduled.length = 0;
    transport.seek(2);
    expect(voice.stop).toHaveBeenCalledTimes(1);
    advance(0.1);
    expect(scheduled.map((s) => s.hit.time)).toEqual([2]);
  });
});
