import { usePlaybackShortcut } from '@/hooks/usePlaybackShortcut';
import { useEffect, useRef, type ChangeEvent } from 'react';
import { playbackSession } from '@/services/playbackSession';
import { formatDuration } from './libraryData';
import type { LibraryAudio } from './useLibraryAudio';

interface Props {
  audio: LibraryAudio;
  title?: string;
}

export default function LibraryPlayer({ audio, title = 'Biblioteca' }: Props) {
  const disabled = !audio.ready;
  const handleSeek = (event: ChangeEvent<HTMLInputElement>) => {
    audio.seek(Number(event.target.value));
  };
  const togglePlay = () => {
    if (audio.playing) audio.pause();
    else void audio.play();
  };

  usePlaybackShortcut(togglePlay, !disabled);
  const current = useRef(audio);
  current.current = audio;
  const id = useRef(Symbol('library-player'));
  useEffect(() => {
    if (audio.playing) playbackSession.start(id.current);
    else playbackSession.stop(id.current);
    const player = id.current;
    return () => playbackSession.stop(player);
  }, [audio.playing]);
  useEffect(() => {
    if (!audio.ready) return;
    return playbackSession.openLibrary({
      title,
      play: () => current.current.play(),
      pause: () => current.current.pause(),
    });
  }, [audio.ready, title]);

  return (
    <div className="border border-border-default bg-bg-card px-3 py-2 flex items-center gap-3">
      <button
        type="button"
        onClick={togglePlay}
        disabled={disabled}
        className="font-heading text-sm px-3 py-1 bg-bg-tertiary text-text-primary hover:bg-accent hover:text-on-accent disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label={audio.playing ? 'Pausar' : 'Tocar'}
      >
        {audio.playing ? 'Pausar' : 'Tocar'}
      </button>
      <input
        type="range"
        min={0}
        max={audio.duration || 0}
        step={0.1}
        value={audio.currentSeconds}
        onChange={handleSeek}
        disabled={disabled}
        aria-label="Posição da faixa"
        className="flex-1 accent-text-primary"
      />
      <span className="text-small text-text-muted font-heading tabular-nums whitespace-nowrap">
        {formatDuration(audio.currentSeconds)} /{' '}
        {formatDuration(audio.duration)}
      </span>
    </div>
  );
}
