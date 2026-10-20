import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPlaybackSession,
  createPlaybackBrowser,
  type LibraryMedia,
} from '@/services/playbackSession';

describe('playback session', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('adapts supported browser APIs independently when one media action is unavailable', async () => {
    const audioSession = { type: 'auto' };
    const actions = new Map<string, MediaSessionActionHandler | null>();
    const mediaSession = {
      metadata: null as MediaMetadata | null,
      setActionHandler: (
        action: string,
        handler: MediaSessionActionHandler | null,
      ) => {
        if (action === 'pause') throw new Error('Unsupported action');
        actions.set(action, handler);
      },
    };
    vi.stubGlobal(
      'MediaMetadata',
      class {
        constructor(public data: { title: string }) {}
        get title() {
          return this.data.title;
        }
      },
    );
    const session = createPlaybackSession(
      createPlaybackBrowser({ audioSession, mediaSession }),
    );
    const song = {
      title: 'Asa Branca',
      play: vi.fn(async () => {}),
      pause: vi.fn(),
    };
    const close = session.openLibrary(song);
    expect(audioSession.type).toBe('playback');
    expect(mediaSession.metadata?.title).toBe('Asa Branca');
    actions.get('play')?.({ action: 'play' });
    await Promise.resolve();
    expect(song.play).toHaveBeenCalledOnce();
    close();
    expect(mediaSession.metadata).toBeNull();
    expect(actions.get('play')).toBeNull();
  });

  it('releases a late wake lock after the last player stops', async () => {
    const release = vi.fn(async () => {});
    let resolve!: (lock: {
      released: boolean;
      release: typeof release;
    }) => void;
    const pending = new Promise<{ released: boolean; release: typeof release }>(
      (done) => {
        resolve = done;
      },
    );
    const session = createPlaybackSession({ requestScreenLock: () => pending });
    const player = Symbol();
    session.start(player);
    session.stop(player);
    resolve({ released: false, release });
    await Promise.resolve();
    expect(release).toHaveBeenCalledOnce();
  });

  it('retries a denied wake lock on the next player start without blocking playback', async () => {
    const requestScreenLock = vi
      .fn()
      .mockRejectedValueOnce(new Error('Denied'))
      .mockResolvedValue({ released: false, release: async () => {} });
    const session = createPlaybackSession({ requestScreenLock });
    const player = Symbol();
    session.start(player);
    await Promise.resolve();
    session.start(player);
    await Promise.resolve();
    expect(requestScreenLock).toHaveBeenCalledTimes(2);
    session.stop(player);
  });

  it('selects media playback audio where supported', () => {
    const setAudioType = vi.fn();
    createPlaybackSession({ setAudioType });
    expect(setAudioType).toHaveBeenCalledWith('playback');
  });

  it('holds one screen lock across two players until the last stop', async () => {
    const release = vi.fn(async () => {});
    const requestScreenLock = vi.fn(async () => ({ released: false, release }));
    const session = createPlaybackSession({ requestScreenLock });
    const song = Symbol('song');
    const metronome = Symbol('metronome');
    session.start(song);
    session.start(song);
    session.start(metronome);
    await Promise.resolve();
    expect(requestScreenLock).toHaveBeenCalledOnce();
    session.stop(song);
    expect(release).not.toHaveBeenCalled();
    session.stop(metronome);
    expect(release).toHaveBeenCalledOnce();
  });

  it('reacquires a released lock on return only while playback continues', async () => {
    let visible = true;
    let visibilityChanged = () => {};
    const locks: { released: boolean; release: () => Promise<void> }[] = [];
    const requestScreenLock = vi.fn(async () => {
      const lock = { released: false, release: async () => {} };
      locks.push(lock);
      return lock;
    });
    const session = createPlaybackSession({
      requestScreenLock,
      isVisible: () => visible,
      onVisibilityChange: (callback) => {
        visibilityChanged = callback;
      },
    });
    const player = Symbol();
    session.start(player);
    await Promise.resolve();
    locks[0].released = true;
    visible = false;
    visibilityChanged();
    expect(requestScreenLock).toHaveBeenCalledTimes(1);
    visible = true;
    visibilityChanged();
    await Promise.resolve();
    expect(requestScreenLock).toHaveBeenCalledTimes(2);
    session.stop(player);
    visibilityChanged();
    expect(requestScreenLock).toHaveBeenCalledTimes(2);
  });

  it('publishes the open Library title and routes play/pause to its player', async () => {
    let media: LibraryMedia | null = null;
    const session = createPlaybackSession({
      setLibraryMedia: (value) => {
        media = value;
      },
    });
    const song = {
      title: 'Asa Branca',
      play: vi.fn(async () => {}),
      pause: vi.fn(),
    };
    const close = session.openLibrary(song);
    const currentMedia = () => media;
    expect(currentMedia()!.title).toBe('Asa Branca');
    await currentMedia()!.play();
    currentMedia()!.pause();
    expect(song.play).toHaveBeenCalledOnce();
    expect(song.pause).toHaveBeenCalledOnce();
    close();
    expect(media).toBeNull();
  });
});
