import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { grooveTotalStepCount } from '@/constants/groove';
import { createGroovePlayback } from '@/services/groovePlayback';
import {
  createTransport,
  type ClockAdapter,
  type Transport,
} from '@/services/transport';
import type { DrumPiece, GroovePattern } from '@/types';

function createFakeClock() {
  const repeats = new Set<(time: number) => void>();
  let bpm = 100;
  const clock: ClockAdapter = {
    resume: async () => {},
    start: () => {},
    stop: () => {},
    setBpm: (value) => {
      bpm = value;
    },
    getBpm: () => bpm,
    repeatQuarter: () => () => {},
    repeat: (cb) => {
      repeats.add(cb);
      return () => {
        repeats.delete(cb);
      };
    },
    eighthSeconds: () => 30 / bpm,
    draw: (cb) => cb(),
    click: () => {},
  };
  return {
    clock,
    ticking: () => repeats.size > 0,
    fire() {
      for (const cb of [...repeats]) cb(0);
    },
  };
}

function emptyGroove(): GroovePattern {
  const steps = grooveTotalStepCount('16n', 1);
  const row = () => Array.from({ length: steps }, () => false);
  return {
    subdivision: '16n',
    measureCount: 1,
    bumbo: row(),
    caixa: row(),
    chimbal: row(),
  };
}

function bumboGroove(): GroovePattern {
  const groove = emptyGroove();
  groove.bumbo[0] = true;
  return groove;
}

function setup(ready = true) {
  const fake = createFakeClock();
  const transport: Transport = createTransport(fake.clock);
  const hits: DrumPiece[] = [];
  const sections: Array<string | null> = [];
  const playback = createGroovePlayback(transport, {
    prepare: async () => ready,
    playHit: (piece) => hits.push(piece),
    onTick: () => {},
    onSectionChange: (id) => sections.push(id),
  });
  return { fake, transport, playback, hits, sections };
}

describe('groove playback', () => {
  it('plays the groove that the caller gives it, on the transport', async () => {
    const { fake, transport, playback, hits, sections } = setup();
    await playback.play({ groove: bumboGroove(), bpm: 120, sectionId: 's1' });
    expect(transport.owner()).toEqual({ kind: 'groove', id: 'groove' });
    expect(fake.clock.getBpm()).toBe(120);
    fake.fire();
    expect(hits).toEqual(['bumbo']);
    expect(sections).toEqual(['s1']);
  });

  it('skips a groove with no hit', async () => {
    const { transport, playback } = setup();
    await playback.play({ groove: emptyGroove(), bpm: 120, sectionId: 's1' });
    expect(transport.owner()).toBeNull();
  });

  it('plays an edited groove on the next tick', async () => {
    const { fake, playback, hits } = setup();
    await playback.play({ groove: bumboGroove(), bpm: 120, sectionId: 's1' });
    const edited = emptyGroove();
    edited.caixa[0] = true;
    playback.update(edited);
    fake.fire();
    expect(hits).toEqual(['caixa']);
  });

  it('restores the tempo and clears the section when it stops', async () => {
    const { fake, transport, playback, sections } = setup();
    await playback.play({ groove: bumboGroove(), bpm: 150, sectionId: 's1' });
    playback.stop();
    expect(fake.clock.getBpm()).toBe(100);
    expect(transport.owner()).toBeNull();
    expect(fake.ticking()).toBe(false);
    expect(sections).toEqual(['s1', null]);
  });

  it('stops cleanly when a progression takes the clock', async () => {
    const { fake, transport, playback, sections } = setup();
    await playback.play({ groove: bumboGroove(), bpm: 150, sectionId: 's1' });
    await transport.takeClock(
      { kind: 'progression', id: 'p1' },
      { onRelease: () => {} },
    );
    expect(playback.playingSectionId()).toBeNull();
    expect(sections).toEqual(['s1', null]);
    expect(fake.clock.getBpm()).toBe(100);
    expect(fake.ticking()).toBe(false);
  });

  it('takes the clock from the metronome', async () => {
    const { transport, playback } = setup();
    await transport.startMetronome();
    await playback.play({ groove: bumboGroove(), bpm: 120, sectionId: 's1' });
    expect(transport.owner()?.kind).toBe('groove');
    expect(transport.isClickOn()).toBe(false);
  });

  it('stops when the audio is not ready', async () => {
    const { transport, playback, sections } = setup(false);
    await playback.play({ groove: bumboGroove(), bpm: 120, sectionId: 's1' });
    expect(transport.owner()).toBeNull();
    expect(playback.playingSectionId()).toBeNull();
    expect(sections).not.toContain('s1');
  });
});

describe('the groove hook', () => {
  const source = readFileSync(
    join(__dirname, '..', 'hooks', 'useGroovePlayer.ts'),
    'utf8',
  );

  it('holds the playing section in state, so a change re-renders', () => {
    expect(source).toMatch(
      /const \[playingSectionId, setPlayingSectionId\] = useState/,
    );
  });

  it('holds no direct call to the shared clock', () => {
    expect(source).not.toMatch(/from 'tone'/);
    expect(source).not.toMatch(/Tone\./);
    expect(source).not.toMatch(/getTransport|getDraw/);
  });
});
