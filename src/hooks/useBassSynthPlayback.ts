import { useEffect, useRef, useState } from 'react';
import type { LibraryAudio } from '@/components/library/useLibraryAudio';
import type { BassChart } from '@/domain/bassChart';
import {
  createBassSynthTransport,
  type BassSynthVoice,
} from '@/services/bassSynthTransport';
import type {
  LibraryAudioSession,
  LibraryAudioState,
} from '@/services/libraryAudioSession';
import { ensureAudio, playbackEngine } from '@/services/playbackEngine';

const SYNTH_VELOCITY = 0.6;

const engineVoice: BassSynthVoice = {
  prepare: async (midiNotes) => {
    if (!(await ensureAudio())) throw new Error('audio unavailable');
    await playbackEngine.preloadBassNotes(midiNotes, SYNTH_VELOCITY);
  },
  now: () => playbackEngine.now(),
  schedule: (note, when) =>
    playbackEngine.scheduleBassNote(
      note.midi,
      SYNTH_VELOCITY,
      note.seconds,
      when,
    ),
  stop: () => playbackEngine.stopBassNotes(),
};

/**
 * A player for a chart that has no recording: the sampled bass plays the
 * chart's notes. It has the shape of `useLibraryAudio`, so the same player
 * and playhead drive either. `failed` reports samples that would not load.
 */
export function useBassSynthPlayback(
  chart: BassChart,
  enabled: boolean,
): LibraryAudio & { failed: boolean } {
  const [state, setState] = useState<LibraryAudioState>({
    ready: false,
    playing: false,
    duration: 0,
    currentSeconds: 0,
  });
  const [failed, setFailed] = useState(false);
  const transportRef = useRef<LibraryAudioSession | null>(null);

  useEffect(() => {
    setState({ ready: false, playing: false, duration: 0, currentSeconds: 0 });
    setFailed(false);
    if (!enabled) return;
    const transport = createBassSynthTransport(chart, engineVoice, setState);
    transportRef.current = transport;
    return () => {
      transport.dispose();
      if (transportRef.current === transport) transportRef.current = null;
    };
  }, [chart, enabled]);

  return {
    ...state,
    failed,
    play: async () => {
      setFailed(false);
      await transportRef.current?.play().catch(() => setFailed(true));
    },
    pause: () => transportRef.current?.pause(),
    seek: (seconds) => transportRef.current?.seek(seconds),
  };
}
