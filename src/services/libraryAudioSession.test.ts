import { describe, expect, it, vi } from 'vitest';
import {
  createLibraryAudioSession,
  type LibraryAnimationClock,
  type LibraryMediaElement,
} from '@/services/libraryAudioSession';
import {
  resolveLibraryChordAt,
  type ChordSegment,
  type LibraryChordVisualState,
} from '@/domain/libraryChordSync';

class FakeMediaElement implements LibraryMediaElement {
  private mediaCurrentTime = 0;
  normalizeSeek: (seconds: number) => number = (seconds) => seconds;
  duration = 120;
  preload = '';
  src = 'blob:track';
  readonly pause = vi.fn();
  readonly play = vi.fn(async () => {});
  private readonly listeners = new Map<string, Set<() => void>>();

  get currentTime(): number {
    return this.mediaCurrentTime;
  }

  set currentTime(seconds: number) {
    this.mediaCurrentTime = this.normalizeSeek(seconds);
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

class FakeAnimationClock implements LibraryAnimationClock {
  private nextId = 1;
  private callbacks = new Map<number, () => void>();

  request(callback: () => void): number {
    const id = this.nextId;
    this.nextId += 1;
    this.callbacks.set(id, callback);
    return id;
  }

  cancel(id: number): void {
    this.callbacks.delete(id);
  }

  frame(): void {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of callbacks) callback();
  }
}

describe('createLibraryAudioSession', () => {
  it('plays and pauses through the media element', async () => {
    const media = new FakeMediaElement();
    const session = createLibraryAudioSession(media, () => {});

    await session.play();
    session.pause();

    expect(media.play).toHaveBeenCalledOnce();
    expect(media.pause).toHaveBeenCalledOnce();
  });

  it('reports playback transitions and media time through its state callback', () => {
    const media = new FakeMediaElement();
    const states: Array<{ playing: boolean; currentSeconds: number }> = [];
    createLibraryAudioSession(media, (state) => states.push(state));

    media.currentTime = 12;
    media.emit('play');
    media.emit('timeupdate');
    media.emit('pause');

    expect(states[states.length - 1]).toMatchObject({
      playing: false,
      currentSeconds: 12,
    });
    expect(states.some((state) => state.playing)).toBe(true);
  });

  it('reads the media clock on every animation frame while playing', () => {
    const media = new FakeMediaElement();
    const clock = new FakeAnimationClock();
    const states: Array<{ currentSeconds: number }> = [];
    createLibraryAudioSession(media, (state) => states.push(state), clock);

    media.currentTime = 0.999;
    media.emit('play');
    media.currentTime = 1;
    clock.frame();
    media.currentTime = 1.04;
    clock.frame();

    expect(states.map((state) => state.currentSeconds)).toEqual([
      0.999, 1, 1.04,
    ]);
  });

  it('drives exact chord states from a controllable media clock', () => {
    const rapidSegments: ChordSegment[] = [
      {
        start_seconds: 1,
        end_seconds: 1.04,
        label: 'minor',
        root_pc: 2,
        candidate_label: 'Dm',
        confidence: 0.8,
      },
      {
        start_seconds: 1.04,
        end_seconds: 2,
        label: 'no_chord',
        root_pc: null,
        candidate_label: 'N',
        confidence: null,
      },
      {
        start_seconds: 3,
        end_seconds: 4,
        label: 'unknown',
        root_pc: null,
        candidate_label: 'X',
        confidence: null,
      },
    ];
    const media = new FakeMediaElement();
    const clock = new FakeAnimationClock();
    const chordStates: LibraryChordVisualState[] = [];
    createLibraryAudioSession(
      media,
      (state) =>
        chordStates.push(
          resolveLibraryChordAt(rapidSegments, state.currentSeconds),
        ),
      clock,
    );

    media.currentTime = 1;
    media.emit('play');
    media.currentTime = 1.02;
    media.emit('pause');
    media.currentTime = 1.04;
    clock.frame();
    media.emit('play');
    media.currentTime = 2.5;
    clock.frame();
    media.currentTime = 3;
    clock.frame();
    media.currentTime = 4;
    clock.frame();

    expect(chordStates).toEqual([
      { text: 'Dm', rootPitchClass: 2, pitchClasses: [2, 5, 9] },
      { text: 'Dm', rootPitchClass: 2, pitchClasses: [2, 5, 9] },
      { text: 'N.C.', rootPitchClass: null, pitchClasses: [] },
      { text: null, rootPitchClass: null, pitchClasses: [] },
      { text: '?', rootPitchClass: null, pitchClasses: [] },
      { text: null, rootPitchClass: null, pitchClasses: [] },
    ]);
  });

  it('freezes at the pause time and resumes from the media clock', () => {
    const media = new FakeMediaElement();
    const clock = new FakeAnimationClock();
    const states: Array<{ playing: boolean; currentSeconds: number }> = [];
    createLibraryAudioSession(media, (state) => states.push(state), clock);

    media.currentTime = 5;
    media.emit('play');
    media.currentTime = 6;
    media.emit('pause');
    media.currentTime = 7;
    clock.frame();
    expect(states[states.length - 1]).toMatchObject({
      playing: false,
      currentSeconds: 6,
    });

    media.currentTime = 8;
    media.emit('play');
    expect(states[states.length - 1]).toMatchObject({
      playing: true,
      currentSeconds: 8,
    });
  });

  it('immediately reports seeks made by the media element', () => {
    const media = new FakeMediaElement();
    const states: Array<{ currentSeconds: number }> = [];
    createLibraryAudioSession(media, (state) => states.push(state));

    media.currentTime = 33;
    media.emit('seeked');

    expect(states[states.length - 1]?.currentSeconds).toBe(33);
  });

  it('seeks the media element and immediately reports the clamped position', () => {
    const media = new FakeMediaElement();
    const states: Array<{ currentSeconds: number }> = [];
    const session = createLibraryAudioSession(media, (state) =>
      states.push(state),
    );
    media.normalizeSeek = (seconds) => Math.floor(seconds);

    session.seek(17.8);

    expect(media.currentTime).toBe(17);
    expect(states[states.length - 1]?.currentSeconds).toBe(17);
  });

  it('stops replaced media and ignores its stale events', () => {
    const firstMedia = new FakeMediaElement();
    const secondMedia = new FakeMediaElement();
    const firstUpdates = vi.fn();
    const secondUpdates = vi.fn();
    const first = createLibraryAudioSession(firstMedia, firstUpdates);

    first.dispose();
    createLibraryAudioSession(secondMedia, secondUpdates);
    firstMedia.currentTime = 42;
    firstMedia.emit('timeupdate');
    secondMedia.currentTime = 7;
    secondMedia.emit('timeupdate');

    expect(firstMedia.pause).toHaveBeenCalledOnce();
    expect(firstMedia.src).toBe('');
    expect(firstUpdates).not.toHaveBeenCalled();
    expect(secondUpdates).toHaveBeenCalledWith(
      expect.objectContaining({ currentSeconds: 7 }),
    );
  });
});
