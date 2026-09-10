import { describe, expect, it, vi } from 'vitest';
import {
  createLibraryAudioSession,
  type LibraryMediaElement,
} from '@/services/libraryAudioSession';

class FakeMediaElement implements LibraryMediaElement {
  currentTime = 0;
  duration = 120;
  preload = '';
  src = 'blob:track';
  readonly pause = vi.fn();
  readonly play = vi.fn(async () => {});
  private readonly listeners = new Map<string, Set<() => void>>();

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

  it('seeks the media element and immediately reports the clamped position', () => {
    const media = new FakeMediaElement();
    const states: Array<{ currentSeconds: number }> = [];
    const session = createLibraryAudioSession(media, (state) =>
      states.push(state),
    );

    session.seek(150);

    expect(media.currentTime).toBe(120);
    expect(states[states.length - 1]?.currentSeconds).toBe(120);
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
