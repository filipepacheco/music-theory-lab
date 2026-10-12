import { useCallback, useRef } from 'react';
import type { LibraryAudio } from '@/components/library/useLibraryAudio';
import {
  barIndexAt,
  sectionIndexOfBar,
  type ChartBars,
} from '@/domain/bassChart';

/**
 * The cursor of the song screen: where the playback is in the chart. The
 * frame draws it and scrolls to it; a part reads it to mark what sounds.
 */
export interface SongCursor {
  /** Seconds of the playback, or NaN before the song has played. */
  clock: number;
  /** The bar under the playhead, or -1. */
  activeBar: number;
  /** The section of that bar, or -1. */
  activeSection: number;
  playing: boolean;
  canPlay: boolean;
  /** Jump to a time; null while there is nothing to play. */
  seek: ((seconds: number) => void) | null;
  togglePlay: () => void;
  /** 0–1 position of the playhead inside a bar, or null in another bar. */
  playhead: (barIndex: number) => number | null;
}

/**
 * The cursor of a chart that `audio` plays. It reads only the bars and the
 * sections of the chart, so it serves a chart of any part.
 */
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

  // The audio hooks hand out fresh closures every render; a stable seek
  // keeps the memoised bars from re-rendering on every animation frame.
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
