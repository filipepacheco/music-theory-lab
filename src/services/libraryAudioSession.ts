export interface LibraryAudioState {
  ready: boolean;
  playing: boolean;
  currentSeconds: number;
  duration: number;
}

export interface LibraryMediaElement {
  currentTime: number;
  duration: number;
  preload: string;
  src: string;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface LibraryAudioSession {
  play(): Promise<void>;
  pause(): void;
  seek(seconds: number): void;
  dispose(): void;
}

export function createLibraryAudioSession(
  media: LibraryMediaElement,
  onStateChange: (state: LibraryAudioState) => void,
): LibraryAudioSession {
  let disposed = false;
  let state: LibraryAudioState = {
    ready: false,
    playing: false,
    currentSeconds: 0,
    duration: 0,
  };

  const update = (next: Partial<LibraryAudioState>) => {
    if (disposed) return;
    state = { ...state, ...next };
    onStateChange(state);
  };
  const onLoaded = () =>
    update({
      ready: true,
      duration: Number.isFinite(media.duration) ? media.duration : 0,
    });
  const onTime = () => update({ currentSeconds: media.currentTime });
  const onPlay = () => update({ playing: true });
  const onPause = () => update({ playing: false });
  const onEnded = () =>
    update({ playing: false, currentSeconds: media.currentTime });
  const listeners = [
    ['loadedmetadata', onLoaded],
    ['timeupdate', onTime],
    ['play', onPlay],
    ['pause', onPause],
    ['ended', onEnded],
  ] as const;

  for (const [type, listener] of listeners) {
    media.addEventListener(type, listener);
  }

  return {
    play: () => media.play(),
    pause: () => media.pause(),
    seek: (seconds) => {
      const end =
        Number.isFinite(media.duration) && media.duration > 0
          ? media.duration
          : seconds;
      const clamped = Math.max(0, Math.min(seconds, end));
      media.currentTime = clamped;
      update({ currentSeconds: clamped });
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      media.pause();
      for (const [type, listener] of listeners) {
        media.removeEventListener(type, listener);
      }
      media.src = '';
    },
  };
}
