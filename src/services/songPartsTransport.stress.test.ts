import { expect, it } from 'vitest';
import { createSongPartsTransport } from '@/services/songPartsTransport';

it('queues both GP parts before their deadlines through 400ms timer stalls', async () => {
  let now = 0;
  let tick = () => {};
  const scheduled: { part: string; when: number; queuedAt: number }[] = [];
  const times = Array.from({ length: 24 }, (_, index) => index / 8);
  const transport = createSongPartsTransport(
    {
      bass: times.map((time) => ({ time, midi: 40, seconds: 0.1 })),
      drums: times.map((time) => ({
        time,
        sample: 'kick' as const,
        rate: 1,
        gain: 1,
      })),
      durationSeconds: 3,
    },
    {
      prepare: async () => {},
      now: () => now,
      scheduleBass: (_note, when) =>
        scheduled.push({ part: 'bass', when, queuedAt: now }),
      scheduleDrum: (_hit, when) =>
        scheduled.push({ part: 'drums', when, queuedAt: now }),
      stop: () => {},
    },
    () => ({ bass: true, drums: true }),
    () => {},
    (callback) => {
      tick = callback;
      return () => {};
    },
  );
  await transport.play();
  for (const at of [0.4, 0.8, 1.2, 1.6, 2, 2.4, 2.8]) {
    now = at;
    tick();
  }
  expect(scheduled).toHaveLength(times.length * 2);
  for (const part of ['bass', 'drums']) {
    expect(
      scheduled
        .filter((event) => event.part === part)
        .map((event) => event.when),
    ).toEqual(times.map((time) => time + 0.05));
  }
  expect(scheduled.every((event) => event.queuedAt < event.when)).toBe(true);
  transport.dispose();
});
