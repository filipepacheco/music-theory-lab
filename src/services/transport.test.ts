import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createTransport,
  type ClockAdapter,
  type TransportEvents,
} from '@/services/transport';

/** A fake clock: the test fires each quarter-note tick by hand. */
function createFakeClock() {
  let tickCallback: ((time: number) => void) | null = null;
  let now = 0;
  const drawQueue: Array<{ cb: () => void; time: number }> = [];
  const clicks: Array<{ accent: boolean; time: number }> = [];
  const calls: string[] = [];
  let bpm = 120;
  const repeats = new Set<(time: number) => void>();

  const clock: ClockAdapter = {
    resume: async () => {},
    start: () => {
      calls.push('start');
    },
    stop: () => {
      calls.push('stop');
    },
    setBpm: (value) => {
      bpm = value;
      calls.push(`bpm:${value}`);
    },
    getBpm: () => bpm,
    repeatQuarter: (cb) => {
      tickCallback = cb;
      calls.push('repeat');
      return () => {
        if (tickCallback === cb) tickCallback = null;
        calls.push('cancel');
      };
    },
    repeat: (cb) => {
      repeats.add(cb);
      return () => {
        repeats.delete(cb);
      };
    },
    eighthSeconds: () => 30 / bpm,
    draw: (cb, time) => {
      drawQueue.push({ cb, time });
    },
    click: (accent, time) => {
      clicks.push({ accent, time });
    },
  };

  return {
    clock,
    clicks,
    calls,
    drawQueue,
    isTicking: () => tickCallback !== null,
    repeatCount: () => repeats.size,
    fireRepeats(time = 0) {
      for (const cb of [...repeats]) cb(time);
    },
    tick(count = 1) {
      for (let i = 0; i < count; i++) {
        now += 0.5;
        tickCallback?.(now);
      }
    },
    flushDraw() {
      const queued = drawQueue.splice(0);
      for (const item of queued) item.cb();
    },
  };
}

function setup() {
  const fake = createFakeClock();
  const events: Required<TransportEvents> = {
    onClickChange: vi.fn(),
    onBeatDraw: vi.fn(),
  };
  const transport = createTransport(fake.clock, events);
  return { fake, transport, events };
}

describe('transport', () => {
  it('starts the metronome and then a progression, and the progression hears the beats', async () => {
    const { fake, transport } = setup();
    await transport.startMetronome();
    fake.tick(2);
    expect(fake.clicks).toHaveLength(2);

    const heard: number[] = [];
    const unsubscribe = transport.onBeat((beat) => heard.push(beat));
    await transport.takeClock(
      { kind: 'progression', id: 'p1' },
      { onRelease: () => {}, click: true },
    );
    fake.tick(3);

    expect(heard).toEqual([2, 3, 0]);
    expect(fake.clicks).toHaveLength(5);
    expect(transport.owner()).toEqual({ kind: 'progression', id: 'p1' });
    // The clock started once, and the progression did not restart it.
    expect(fake.calls.filter((c) => c === 'start')).toHaveLength(1);
    unsubscribe();
  });

  it('holds one list of beat listeners, and each listener hears each beat', async () => {
    const { fake, transport } = setup();
    const a: number[] = [];
    const b: number[] = [];
    transport.onBeat((beat) => a.push(beat));
    const offB = transport.onBeat((beat) => b.push(beat));
    await transport.startMetronome();
    fake.tick(2);
    offB();
    fake.tick(1);
    expect(a).toEqual([0, 1, 2]);
    expect(b).toEqual([0, 1]);
  });

  it('hands off from the metronome to a progression and back', async () => {
    const { fake, transport, events } = setup();
    await transport.startMetronome();
    expect(transport.owner()).toEqual({ kind: 'metronome', id: 'metronome' });
    expect(events.onClickChange).toHaveBeenLastCalledWith(true);

    const release = vi.fn();
    await transport.takeClock(
      { kind: 'progression', id: 'p1' },
      { onRelease: release, click: true },
    );
    expect(transport.owner()?.kind).toBe('progression');

    // The progression stops; the metronome that was on before keeps the clock.
    transport.releaseClock('p1');
    expect(release).not.toHaveBeenCalled();
    expect(transport.owner()).toEqual({ kind: 'metronome', id: 'metronome' });
    expect(transport.isClickOn()).toBe(true);
    expect(fake.isTicking()).toBe(true);
    fake.tick(1);
    expect(fake.clicks).toHaveLength(1);
  });

  it('hands off from a progression to the metronome, and both keep playing', async () => {
    const { fake, transport } = setup();
    const heard: number[] = [];
    transport.onBeat((beat) => heard.push(beat));
    await transport.takeClock(
      { kind: 'progression', id: 'p1' },
      { onRelease: () => {} },
    );
    fake.tick(2);
    expect(fake.clicks).toHaveLength(0);

    await transport.startMetronome();
    fake.tick(2);
    expect(heard).toEqual([0, 1, 2, 3]);
    expect(fake.clicks).toHaveLength(2);
    expect(transport.owner()?.kind).toBe('progression');

    // Turning the metronome off silences the click, and the progression plays on.
    transport.stopMetronome();
    fake.tick(1);
    expect(heard).toEqual([0, 1, 2, 3, 0]);
    expect(fake.clicks).toHaveLength(2);
    expect(transport.owner()?.kind).toBe('progression');

    // The progression stops last, and the clock stops.
    transport.releaseClock('p1');
    expect(transport.owner()).toBeNull();
    expect(fake.isTicking()).toBe(false);
    expect(fake.calls[fake.calls.length - 1]).toBe('stop');
  });

  it('turns the click off after a progression that turned it on stops', async () => {
    const { fake, transport, events } = setup();
    await transport.takeClock(
      { kind: 'progression', id: 'p1' },
      { onRelease: () => {}, click: true },
    );
    expect(transport.isClickOn()).toBe(true);
    transport.releaseClock('p1');
    expect(transport.isClickOn()).toBe(false);
    expect(events.onClickChange).toHaveBeenLastCalledWith(false);
    expect(fake.isTicking()).toBe(false);
  });

  it('lets a new player take the clock, and the old one stops cleanly', async () => {
    const { fake, transport } = setup();
    const releaseA = vi.fn(() => transport.releaseClock('a'));
    await transport.takeClock(
      { kind: 'progression', id: 'a' },
      { onRelease: releaseA, click: true },
    );
    await transport.takeClock(
      { kind: 'progression', id: 'b' },
      { onRelease: () => {}, click: true },
    );
    expect(releaseA).toHaveBeenCalledTimes(1);
    expect(transport.owner()).toEqual({ kind: 'progression', id: 'b' });
    // Releasing the old player from its own stop does not touch the new owner.
    expect(transport.isClickOn()).toBe(true);
    expect(fake.isTicking()).toBe(true);
  });

  it('stops the clock and releases the owner when the metronome is the only player', async () => {
    const { fake, transport } = setup();
    await transport.startMetronome();
    transport.stopMetronome();
    expect(transport.owner()).toBeNull();
    expect(fake.isTicking()).toBe(false);
    expect(fake.calls).toContain('stop');
  });

  it('stopAll releases the owner and stops the clock', async () => {
    const { fake, transport } = setup();
    const release = vi.fn();
    await transport.takeClock(
      { kind: 'progression', id: 'p1' },
      { onRelease: release, click: true },
    );
    transport.stopAll();
    expect(release).toHaveBeenCalledTimes(1);
    expect(transport.owner()).toBeNull();
    expect(transport.isClickOn()).toBe(false);
    expect(fake.isTicking()).toBe(false);
  });

  it('sends each UI update from a clock callback through the draw scheduler', async () => {
    const { fake, transport, events } = setup();
    await transport.startMetronome();
    fake.tick(1);
    expect(events.onBeatDraw).not.toHaveBeenCalled();
    expect(fake.drawQueue).toHaveLength(1);
    fake.flushDraw();
    expect(events.onBeatDraw).toHaveBeenCalledWith(0);

    const ui = vi.fn();
    transport.onBeat((_beat, time) => transport.draw(ui, time));
    fake.tick(1);
    expect(ui).not.toHaveBeenCalled();
    fake.flushDraw();
    expect(ui).toHaveBeenCalledTimes(1);
  });

  it('sets the tempo of the clock', () => {
    const { fake, transport } = setup();
    transport.setTempo(90);
    expect(fake.clock.getBpm()).toBe(90);
    expect(transport.eighthSeconds()).toBeCloseTo(30 / 90);
  });
});

describe('transport and a groove', () => {
  const groove = { kind: 'groove', id: 'g1' } as const;

  it('a groove takes the clock from the metronome and silences the click', async () => {
    const { fake, transport } = setup();
    await transport.startMetronome();
    fake.tick(1);
    await transport.takeClock(groove, { onRelease: () => {} });
    expect(transport.owner()).toEqual(groove);
    expect(transport.isClickOn()).toBe(false);
    fake.tick(2);
    expect(fake.clicks).toHaveLength(1);
  });

  it('a groove takes the clock from a progression, and the progression stops cleanly', async () => {
    const { fake, transport } = setup();
    const release = vi.fn(() => transport.releaseClock('p1'));
    await transport.takeClock(
      { kind: 'progression', id: 'p1' },
      { onRelease: release, click: true },
    );
    await transport.takeClock(groove, { onRelease: () => {} });
    expect(release).toHaveBeenCalledTimes(1);
    expect(transport.owner()).toEqual(groove);
    expect(transport.isClickOn()).toBe(false);
    expect(fake.isTicking()).toBe(true);
  });

  it('a progression takes the clock from a groove, and the groove stops', async () => {
    const { transport } = setup();
    const releaseGroove = vi.fn();
    await transport.takeClock(groove, { onRelease: releaseGroove });
    await transport.takeClock(
      { kind: 'progression', id: 'p1' },
      { onRelease: () => {}, click: true },
    );
    expect(releaseGroove).toHaveBeenCalledTimes(1);
    expect(transport.owner()?.kind).toBe('progression');
  });

  it('the metronome turned on during a groove does not take the clock', async () => {
    const { transport } = setup();
    await transport.takeClock(groove, { onRelease: () => {} });
    await transport.startMetronome();
    expect(transport.owner()?.kind).toBe('groove');
  });

  it('stops the groove ticks when the clock stops', async () => {
    const { fake, transport } = setup();
    await transport.takeClock(groove, { onRelease: () => {} });
    const cb = vi.fn();
    transport.repeat(0.1, cb);
    fake.fireRepeats();
    expect(cb).toHaveBeenCalledTimes(1);
    transport.releaseClock('g1');
    expect(fake.repeatCount()).toBe(0);
    expect(fake.isTicking()).toBe(false);
  });

  it('restores the tempo after a groove stops', async () => {
    const { fake, transport } = setup();
    transport.setTempo(100);
    await transport.takeClock(groove, { onRelease: () => {} });
    transport.setTempo(150);
    expect(fake.clock.getBpm()).toBe(150);
    transport.releaseClock('g1');
    expect(fake.clock.getBpm()).toBe(100);
  });

  it('restores the tempo once when a groove replaces a groove, and on stopAll', async () => {
    const { fake, transport } = setup();
    transport.setTempo(90);
    await transport.takeClock(groove, { onRelease: () => {} });
    transport.setTempo(140);
    await transport.takeClock(
      { kind: 'groove', id: 'g2' },
      { onRelease: () => {} },
    );
    transport.setTempo(160);
    transport.stopAll();
    expect(fake.clock.getBpm()).toBe(90);
  });

  it('restores the tempo when another player takes the clock from the groove', async () => {
    const { fake, transport } = setup();
    transport.setTempo(80);
    await transport.takeClock(groove, { onRelease: () => {} });
    transport.setTempo(130);
    await transport.takeClock(
      { kind: 'progression', id: 'p1' },
      { onRelease: () => {} },
    );
    expect(fake.clock.getBpm()).toBe(80);
  });

  it('restores the tempo when the metronome is on and the groove stops', async () => {
    const { fake, transport } = setup();
    transport.setTempo(70);
    await transport.startMetronome();
    await transport.takeClock(groove, { onRelease: () => {} });
    transport.setTempo(120);
    transport.releaseClock('g1');
    expect(fake.clock.getBpm()).toBe(70);
  });
});

describe('the shared clock boundary', () => {
  const srcDir = join(__dirname, '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        files.push(path);
      }
    }
  };
  walk(srcDir);
  const rel = (path: string) => relative(srcDir, path).replace(/\\/g, '/');

  it('only the Tone clock adapter touches the shared Tone clock', () => {
    const allowed = new Set(['services/toneClock.ts']);
    const offenders = files
      .filter((path) => !allowed.has(rel(path)))
      .filter((path) =>
        /getTransport\(|Tone\.Transport|Tone\.Loop|getDraw\(/.test(
          readFileSync(path, 'utf8'),
        ),
      )
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('the metronome hook and the step player hold no direct call to the clock', () => {
    for (const file of [
      'hooks/useMetronome.ts',
      'hooks/useStepPlayer.ts',
      'hooks/useGroovePlayer.ts',
    ]) {
      const source = readFileSync(join(srcDir, file), 'utf8');
      expect(source, file).not.toMatch(/from 'tone'/);
      expect(source, file).not.toMatch(/Tone\./);
    }
  });
});
