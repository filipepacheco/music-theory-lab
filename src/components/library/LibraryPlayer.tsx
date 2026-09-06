import type { ChangeEvent } from 'react';
import { formatDuration } from './libraryData';
import type { LibraryAudio } from './useLibraryAudio';

interface Props {
  audio: LibraryAudio;
}

export default function LibraryPlayer({ audio }: Props) {
  const disabled = !audio.ready;
  const handleSeek = (event: ChangeEvent<HTMLInputElement>) => {
    audio.seek(Number(event.target.value));
  };
  const togglePlay = () => {
    if (audio.playing) audio.pause();
    else void audio.play();
  };

  return (
    <div className="rounded-button border border-border-default bg-bg-card px-3 py-2 flex items-center gap-3">
      <button
        type="button"
        onClick={togglePlay}
        disabled={disabled}
        className="font-heading text-sm px-3 py-1 rounded-button bg-bg-elevated text-text-primary hover:bg-bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
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
      <span className="text-[11px] text-text-muted font-heading tabular-nums whitespace-nowrap">
        {formatDuration(audio.currentSeconds)} /{' '}
        {formatDuration(audio.duration)}
      </span>
    </div>
  );
}
