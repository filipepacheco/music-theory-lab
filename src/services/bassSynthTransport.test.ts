import { describe, expect, it, vi } from 'vitest';
import type { BassChartNote } from '@/domain/bassChart';
import {
  bassSynthNotes,
  createBassSynthTransport,
  type BassSynthNote,
  type BassSynthVoice,
} from '@/services/bassSynthTransport';
import type { LibraryAudioState } from '@/services/libraryAudioSession';

function note(
  partial: Partial<BassChartNote> & { time: number },
): BassChartNote {
  return {
    endTime: partial.time + 0.5,
    string: 1,
    fret: 2,
    midi: 35,
    sustain: 0,
    bar: 0,
    beatInBar: 0,
    slideToFret: null,
    techniques: [],
    ...partial,
  };
}

/** A voice on a clock the test advances, with a timer it fires by hand. */
function harness(notes: BassChartNote[], songLengthSeconds = 4) {
  let now = 10;
  let tick: (() => void) | null = null;
  const scheduled: { note: BassSynthNote; when: number }[] = [];
  const states: LibraryAudioState[] = [];
  const voice: BassSynthVoice = {
    prepare: vi.fn(async () => {}),
    now: () => now,
    schedule: (scheduledNote, when) =>
      scheduled.push({ note: scheduledNote, when }),
    stop: vi.fn(),
  };
  const transport = createBassSynthTransport(
    { notes, songLengthSeconds },
    voice,
    (state) => states.push(state),
    (callback) => {
      tick = callback;
      return () => {
        tick = null;
      };
    },
  );
  return {
    transport,
    voice,
    scheduled,
    state: () => states[states.length - 1],
    running: () => tick !== null,
    advance(seconds: number) {
      now += seconds;
      tick?.();
    },
  };
}

describe('bassSynthNotes', () => {
  it('preserves sounding octave intervals across the sample range boundary', () => {
    const sounds = bassSynthNotes(
      [note({ time: 0, midi: 51 }), note({ time: 1, midi: 63 })],
      -1,
    );
    expect(sounds.map((n) => n.midi + (n.transposeSemitones ?? 0))).toEqual([
      51, 63,
    ]);
  });
  it('transposes from the original register without octave jumps at sample boundaries', () => {
    const down = bassSynthNotes([note({ time: 0, midi: 27 })], -1)[0];
    const up = bassSynthNotes([note({ time: 0, midi: 56 })], 1)[0];
    expect(down).toMatchObject({ midi: 28, transposeSemitones: -1 });
    expect(up).toMatchObject({ midi: 55, transposeSemitones: 1 });
  });
  it('holds a note for its sustain, or for as long as the chart shows it', () => {
    const notes = bassSynthNotes([
      note({ time: 0, sustain: 0.25 }),
      note({ time: 1, endTime: 1.5 }),
    ]);
    expect(notes.map((n) => n.seconds)).toEqual([0.25, 0.5]);
  });

  it('cuts a note at the next onset but lets a double stop ring together', () => {
    const notes = bassSynthNotes([
      note({ time: 0, sustain: 2 }),
      note({ time: 0, sustain: 2, string: 2 }),
      note({ time: 0.5, sustain: 1 }),
    ]);
    expect(notes.map((n) => n.seconds)).toEqual([0.5, 0.5, 1]);
  });

  it('plays dead notes short and shifts available samples to the exact chart register', () => {
    const notes = bassSynthNotes([
      note({ time: 0, techniques: ['mute'], sustain: 1 }),
      note({ time: 1, midi: 23 }),
      note({ time: 2, midi: 60 }),
    ]);
    expect(notes[0].seconds).toBe(0.06);
    expect(notes.map((n) => n.midi)).toEqual([35, 35, 48]);
    expect(notes.map((n) => n.midi + (n.transposeSemitones ?? 0))).toEqual([
      35, 23, 60,
    ]);
  });
});

describe('createBassSynthTransport', () => {
  const line = [
    note({ time: 0 }),
    note({ time: 0.5, midi: 40 }),
    note({ time: 3 }),
  ];

  it('is ready at once, with the chart length as its duration', () => {
    expect(harness(line).state()).toEqual({
      ready: true,
      playing: false,
      currentSeconds: 0,
      duration: 4,
    });
  });

  it('prepares the pitches, then schedules notes ahead on the audio clock', async () => {
    const h = harness(line);
    await h.transport.play();
    expect(h.voice.prepare).toHaveBeenCalledWith([35, 40]);
    expect(h.state().playing).toBe(true);
    // Only the first note is inside the look-ahead window at the start.
    expect(h.scheduled.map((s) => s.when)).toEqual([10.05]);

    h.advance(0.4);
    expect(h.scheduled.map((s) => [s.note.midi, s.when])).toEqual([
      [35, 10.05],
      [40, 10.55],
    ]);
    expect(h.state().currentSeconds).toBeCloseTo(0.35);
  });

  it('pauses where it is and resumes from there', async () => {
    const h = harness(line);
    await h.transport.play();
    h.advance(1.05);
    h.transport.pause();
    expect(h.voice.stop).toHaveBeenCalledTimes(1);
    expect(h.running()).toBe(false);
    expect(h.state()).toMatchObject({ playing: false, currentSeconds: 1 });

    h.advance(5);
    await h.transport.play();
    h.advance(1.9);
    // The note at 3 s is two seconds after the resume point.
    expect(h.scheduled[h.scheduled.length - 1].when).toBeCloseTo(
      10 + 1.05 + 5 + 0.05 + 2,
    );
  });

  it('seeks while playing by silencing and re-anchoring', async () => {
    const h = harness(line);
    await h.transport.play();
    h.transport.seek(2.9);
    expect(h.voice.stop).toHaveBeenCalledTimes(1);
    expect(h.state().currentSeconds).toBe(2.9);
    h.advance(0.025);
    expect(h.scheduled[h.scheduled.length - 1]).toMatchObject({
      note: { time: 3 },
      when: 10.15,
    });
  });

  it('clamps a seek while stopped and plays from there', async () => {
    const h = harness(line);
    h.transport.seek(99);
    expect(h.state().currentSeconds).toBe(4);
    h.transport.seek(0.2);
    await h.transport.play();
    expect(h.scheduled.map((s) => s.note.time)).toEqual([]);
    h.advance(0.3);
    expect(h.scheduled.map((s) => s.note.time)).toEqual([0.5]);
  });

  it('stops at the end and starts over on the next play', async () => {
    const h = harness(line);
    await h.transport.play();
    h.advance(5);
    expect(h.state()).toMatchObject({ playing: false, currentSeconds: 4 });
    expect(h.running()).toBe(false);

    await h.transport.play();
    expect(h.state()).toMatchObject({ playing: true, currentSeconds: 0 });
  });

  it('drops notes a stalled timer missed instead of bursting them', async () => {
    const h = harness(line);
    await h.transport.play();
    h.advance(2.95);
    // 0.5 s was due long ago; 3 s is still ahead.
    expect(h.scheduled.map((s) => s.note.time)).toEqual([0, 3]);
  });

  it('stays silent when the sound cannot load, and after dispose', async () => {
    const h = harness(line);
    vi.mocked(h.voice.prepare).mockRejectedValueOnce(new Error('offline'));
    await expect(h.transport.play()).rejects.toThrow('offline');
    expect(h.state().playing).toBe(false);

    await h.transport.play();
    h.transport.dispose();
    expect(h.voice.stop).toHaveBeenCalledTimes(1);
    expect(h.running()).toBe(false);
    await h.transport.play();
    expect(h.voice.prepare).toHaveBeenCalledTimes(2);
  });
});
