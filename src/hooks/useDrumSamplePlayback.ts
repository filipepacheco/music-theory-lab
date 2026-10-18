import { useEffect, useRef, useState } from 'react';
import type { LibraryAudio } from '@/components/library/useLibraryAudio';
import type { DrumChart } from '@/domain/drumChart';
import {
  createDrumSampleTransport,
  type DrumSampleVoice,
} from '@/services/drumSampleTransport';
import type {
  LibraryAudioSession,
  LibraryAudioState,
} from '@/services/libraryAudioSession';
import { ensureAudio, playbackEngine } from '@/services/playbackEngine';

const engineVoice: DrumSampleVoice = {
  prepare: async (samples) => {
    if (!(await ensureAudio())) throw new Error('audio unavailable');
    await playbackEngine.preloadDrumSamples(samples);
  },
  now: () => playbackEngine.now(),
  schedule: (hit, when) => playbackEngine.scheduleDrumHit(hit, when),
  stop: () => playbackEngine.stopDrumHits(),
};

export function useDrumSamplePlayback(
  chart: DrumChart,
  enabled: boolean,
): LibraryAudio {
  const [state, setState] = useState<LibraryAudioState>({
    ready: false,
    playing: false,
    duration: 0,
    currentSeconds: 0,
  });
  const transportRef = useRef<LibraryAudioSession | null>(null);

  useEffect(() => {
    setState({ ready: false, playing: false, duration: 0, currentSeconds: 0 });
    if (!enabled) return;
    const transport = createDrumSampleTransport(chart, engineVoice, setState);
    transportRef.current = transport;
    return () => {
      transport.dispose();
      if (transportRef.current === transport) transportRef.current = null;
    };
  }, [chart, enabled]);

  return {
    ...state,
    play: async () => {
      await transportRef.current?.play().catch(() => {});
    },
    pause: () => transportRef.current?.pause(),
    seek: (seconds) => transportRef.current?.seek(seconds),
  };
}
