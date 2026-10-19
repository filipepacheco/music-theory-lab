import { playbackSession } from '@/services/playbackSession';
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

export function useLibraryAudio(
  url: string | null,
  bassMix?: BassMixSetting | string,
  mediaTitle = 'Biblioteca',
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
  const mixMode = typeof bassMix === 'object' ? bassMix.mode : 'full';
  const title = typeof bassMix === 'string' ? bassMix : mediaTitle;
  const crossoverHz = typeof bassMix === 'object' ? bassMix.crossoverHz : 0;

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
    const id = Symbol('library');
    const closeMedia = playbackSession.openLibrary({
      title,
      play: async () => {
        void graphRef.current?.resume();
        await session.play().catch(() => {});
      },
      pause: () => session.pause(),
    });
    const onPlaying = () => playbackSession.start(id);
    const onStop = () => playbackSession.stop(id);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('pause', onStop);
    audio.addEventListener('ended', onStop);
    audio.addEventListener('error', onStop);

    return () => {
      session.dispose();
      onStop();
      closeMedia();
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('pause', onStop);
      audio.removeEventListener('ended', onStop);
      audio.removeEventListener('error', onStop);
      graphRef.current?.dispose();
      graphRef.current = null;
      if (sessionRef.current === session) sessionRef.current = null;
      if (mediaRef.current === audio) mediaRef.current = null;
    };
  }, [url, title]);

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
