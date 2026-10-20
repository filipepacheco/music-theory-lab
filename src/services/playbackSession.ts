export interface ScreenLock {
  readonly released: boolean;
  release(): Promise<void>;
}

export interface LibraryMedia {
  title: string;
  play(): Promise<void>;
  pause(): void;
}

export interface PlaybackBrowser {
  setAudioType?(type: 'playback'): void;
  requestScreenLock?(): Promise<ScreenLock>;
  isVisible?(): boolean;
  onVisibilityChange?(callback: () => void): void;
  setLibraryMedia?(media: LibraryMedia | null): void;
}

export function createPlaybackSession(browser: PlaybackBrowser) {
  browser.setAudioType?.('playback');
  const players = new Set<symbol>();
  let lock: ScreenLock | undefined;
  let requesting = false;
  let library: LibraryMedia | null = null;

  async function acquire() {
    if (lock?.released) lock = undefined;
    if (
      !players.size ||
      lock ||
      requesting ||
      !browser.requestScreenLock ||
      browser.isVisible?.() === false
    )
      return;
    requesting = true;
    try {
      const next = await browser.requestScreenLock();
      if (players.size && browser.isVisible?.() !== false) lock = next;
      else await next.release();
    } catch {
      // Browser policy may refuse a wake lock; audio can still play.
    } finally {
      requesting = false;
    }
  }

  browser.onVisibilityChange?.(() => {
    void acquire();
  });

  return {
    openLibrary(media: LibraryMedia) {
      library = media;
      browser.setLibraryMedia?.(media);
      return () => {
        if (library !== media) return;
        library = null;
        browser.setLibraryMedia?.(null);
      };
    },
    start(player: symbol) {
      players.add(player);
      void acquire();
    },
    stop(player: symbol) {
      players.delete(player);
      if (!players.size && lock) {
        void lock.release().catch(() => {});
        lock = undefined;
      }
    },
  };
}

interface MediaNavigator {
  audioSession?: { type: string };
  wakeLock?: { request(type: 'screen'): Promise<ScreenLock> };
  mediaSession?: Pick<MediaSession, 'metadata' | 'setActionHandler'>;
}

export function createPlaybackBrowser(
  navigator: MediaNavigator = globalThis.navigator ?? {},
  page: Document | undefined = globalThis.document,
): PlaybackBrowser {
  return {
    setAudioType(type) {
      try {
        if (navigator.audioSession) navigator.audioSession.type = type;
      } catch {
        /* Unsupported browser policy. */
      }
    },
    requestScreenLock: navigator.wakeLock
      ? () => navigator.wakeLock!.request('screen')
      : undefined,
    isVisible: () => !page || page.visibilityState === 'visible',
    onVisibilityChange: (callback) => {
      page?.addEventListener('visibilitychange', callback);
    },
    setLibraryMedia(media) {
      const session = navigator.mediaSession;
      if (!session) return;
      try {
        session.metadata =
          media && typeof MediaMetadata !== 'undefined'
            ? new MediaMetadata({ title: media.title })
            : null;
      } catch {
        /* Metadata is optional independently of actions. */
      }
      for (const action of ['play', 'pause'] as const) {
        try {
          session.setActionHandler(
            action,
            media
              ? () => {
                  void Promise.resolve()
                    .then(() => media[action]())
                    .catch(() => {});
                }
              : null,
          );
        } catch {
          /* Some browsers expose only a subset of actions. */
        }
      }
    },
  };
}

export const playbackSession = createPlaybackSession(createPlaybackBrowser());
