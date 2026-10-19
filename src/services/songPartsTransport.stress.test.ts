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

it('publishes fewer song renders while exposing the current audio-clock position', async () => {
  let now = 0;
  let tick = () => {};
  let updates = 0;
  const transport = createSongPartsTransport(
    { bass: [], drums: [], durationSeconds: 3 },
    {
      prepare: async () => {},
      now: () => now,
      scheduleBass: () => {},
      scheduleDrum: () => {},
      stop: () => {},
    },
    () => ({ bass: true, drums: true }),
    () => {
      updates += 1;
    },
    (callback) => {
      tick = callback;
      return () => {};
    },
  );
  await transport.play();
  updates = 0;
  for (let step = 1; step <= 40; step += 1) {
    now = step * 0.025;
    tick();
  }
  expect(updates).toBeGreaterThan(0);
  expect(updates).toBeLessThanOrEqual(10);
  expect(transport.readPosition()).toBeCloseTo(0.95);
  transport.pause();
  now = 2;
  expect(transport.readPosition()).toBeCloseTo(0.95);
  transport.seek(0.4);
  expect(transport.readPosition()).toBe(0.4);
  transport.dispose();
});
