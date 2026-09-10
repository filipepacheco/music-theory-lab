import { useEffect, useRef, useState } from 'react';
import {
  createLibraryAudioSession,
  type LibraryAudioSession,
  type LibraryAudioState,
} from '@/services/libraryAudioSession';

export interface LibraryAudio {
  ready: boolean;
  playing: boolean;
  currentSeconds: number;
  duration: number;
  play(): Promise<void>;
  pause(): void;
  seek(seconds: number): void;
}

/**
 * Wrap an <audio> element for the Biblioteca player. `url` may be null while
 * the source is being probed (no player rendered upstream); a fresh URL
 * swaps the source and rewinds to zero. Cleans up on unmount so we never
 * leak the underlying media element or its ticker.
 */
export function useLibraryAudio(url: string | null): LibraryAudio {
  const [state, setState] = useState<LibraryAudioState>({
    ready: false,
    playing: false,
    duration: 0,
    currentSeconds: 0,
  });
  const sessionRef = useRef<LibraryAudioSession | null>(null);

  useEffect(() => {
    setState({
      ready: false,
      playing: false,
      duration: 0,
      currentSeconds: 0,
    });
    if (!url) {
      sessionRef.current = null;
      return;
    }
    const audio = new Audio();
    audio.preload = 'metadata';
    const session = createLibraryAudioSession(audio, setState);
    sessionRef.current = session;
    audio.src = url;

    return () => {
      session.dispose();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [url]);

  return {
    ...state,
    play: async () => {
      await sessionRef.current?.play().catch(() => {});
    },
    pause: () => sessionRef.current?.pause(),
    seek: (seconds) => sessionRef.current?.seek(seconds),
  };
}
