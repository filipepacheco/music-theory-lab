import { useEffect, useRef, useState } from 'react';
import type { BassMixMode } from '@/domain/bassMix';
import { createBassMixGraph, type BassMixGraph } from '@/services/bassMixGraph';
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

export interface BassMixSetting {
  mode: BassMixMode;
  crossoverHz: number;
}

/**
 * Wrap an <audio> element for the Biblioteca player. `url` may be null while
 * the source is being probed (no player rendered upstream); a fresh URL
 * swaps the source and rewinds to zero. Cleans up on unmount so we never
 * leak the underlying media element or its ticker.
 *
 * `bassMix` filters playback into a practice mix. The Web Audio graph is
 * built only when a filtered mix is first chosen, so plain playback never
 * depends on an AudioContext.
 */
export function useLibraryAudio(
  url: string | null,
  bassMix?: BassMixSetting,
): LibraryAudio {
  const [state, setState] = useState<LibraryAudioState>({
    ready: false,
    playing: false,
    duration: 0,
    currentSeconds: 0,
  });
  const sessionRef = useRef<LibraryAudioSession | null>(null);
  const mediaRef = useRef<HTMLAudioElement | null>(null);
  const graphRef = useRef<BassMixGraph | null>(null);
  const mixMode = bassMix?.mode ?? 'full';
  const crossoverHz = bassMix?.crossoverHz ?? 0;

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
    mediaRef.current = audio;
    audio.src = url;

    return () => {
      session.dispose();
      graphRef.current?.dispose();
      graphRef.current = null;
      if (sessionRef.current === session) sessionRef.current = null;
      if (mediaRef.current === audio) mediaRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    if (!graphRef.current) {
      if (mixMode === 'full') return;
      graphRef.current = createBassMixGraph(media);
    }
    graphRef.current.apply(mixMode, crossoverHz);
    // Once routed through the graph the element is silent while the context
    // is suspended, so a mix switched on mid-song must wake it.
    if (!media.paused) void graphRef.current.resume();
  }, [url, mixMode, crossoverHz]);

  return {
    ...state,
    play: async () => {
      void graphRef.current?.resume();
      await sessionRef.current?.play().catch(() => {});
    },
    pause: () => sessionRef.current?.pause(),
    seek: (seconds) => sessionRef.current?.seek(seconds),
  };
}
