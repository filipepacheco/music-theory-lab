import { useCallback, useRef } from 'react';
import type { LibraryAudio } from '@/components/library/useLibraryAudio';
import {
  barIndexAt,
  sectionIndexOfBar,
  type ChartBars,
} from '@/domain/bassChart';

export interface SongCursor {
  clock: number;
  activeBar: number;
  activeSection: number;
  playing: boolean;
  canPlay: boolean;
  seek: ((seconds: number) => void) | null;
  togglePlay: () => void;
  playhead: (barIndex: number) => number | null;
}

export function useSongCursor(
  chart: ChartBars,
  audio: LibraryAudio,
  hasPlayer: boolean,
): SongCursor {
  const clock =
    hasPlayer && audio.ready && (audio.playing || audio.currentSeconds > 0)
      ? audio.currentSeconds
      : Number.NaN;
  const activeBar = barIndexAt(chart, clock);
  const activeSection =
    activeBar >= 0 ? sectionIndexOfBar(chart, activeBar) : -1;

  const audioRef = useRef(audio);
  audioRef.current = audio;
  const stableSeek = useCallback(
    (seconds: number) => audioRef.current.seek(seconds),
    [],
  );
  const togglePlay = useCallback(() => {
    if (audioRef.current.playing) audioRef.current.pause();
    else void audioRef.current.play();
  }, []);

  const playhead = (barIndex: number): number | null => {
    if (barIndex !== activeBar) return null;
    if (audio.readPosition) return 0;
    const bar = chart.bars[barIndex];
    return (clock - bar.startTime) / (bar.endTime - bar.startTime);
  };

  return {
    clock,
    activeBar,
    activeSection,
    playing: audio.playing,
    canPlay: hasPlayer && audio.ready,
    seek: hasPlayer && audio.ready ? stableSeek : null,
    togglePlay,
    playhead,
  };
}
