import { useEffect, useRef, useState } from 'react';

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
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!url) {
      audioRef.current = null;
      setReady(false);
      setPlaying(false);
      setDuration(0);
      setCurrentSeconds(0);
      return;
    }
    const audio = new Audio(url);
    audio.preload = 'metadata';
    audioRef.current = audio;
    setReady(false);
    setPlaying(false);
    setDuration(0);
    setCurrentSeconds(0);

    const onLoaded = () => {
      setReady(true);
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    const onTime = () => setCurrentSeconds(audio.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.src = '';
      audioRef.current = null;
    };
  }, [url]);

  return {
    ready,
    playing,
    currentSeconds,
    duration,
    play: async () => {
      const audio = audioRef.current;
      if (!audio) return;
      await audio.play().catch(() => {});
    },
    pause: () => audioRef.current?.pause(),
    seek: (seconds) => {
      const audio = audioRef.current;
      if (!audio) return;
      const clamped = Math.max(0, Math.min(seconds, audio.duration || seconds));
      audio.currentTime = clamped;
      setCurrentSeconds(clamped);
    },
  };
}
