import { useCallback, useEffect, useState } from 'react';
import {
  rocksmithLibrary,
  type StoredChartAudio,
} from '@/services/rocksmithLibrary';

export type RocksmithAudioState =
  | { status: 'loading' }
  | { status: 'missing' }
  | {
      status: 'ready';
      url: string;
      fileName: string;
      origin: StoredChartAudio['origin'];
      /** False when this browser reports it cannot decode the stored file. */
      playable: boolean;
    };

function canPlay(blob: Blob): boolean {
  if (!blob.type || typeof document === 'undefined') return true;
  const probe = document.createElement('audio');
  const type =
    blob.type === 'audio/ogg' ? 'audio/ogg; codecs="vorbis"' : blob.type;
  return probe.canPlayType(type) !== '';
}

/**
 * Object URL for the audio stored with an imported chart. The user may swap
 * it for a file of their own (e.g. an MP3 where the browser cannot play the
 * extracted Ogg Vorbis); no hash check applies, since a package's audio has no
 * published fingerprint to compare against.
 */
export function useRocksmithAudio(chartId: string) {
  const [state, setState] = useState<RocksmithAudioState>({
    status: 'loading',
  });
  const [revision, setRevision] = useState(0);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setState({ status: 'loading' });
    rocksmithLibrary
      .getAudio(chartId)
      .then((audio) => {
        if (cancelled) return;
        if (!audio) {
          setState({ status: 'missing' });
          return;
        }
        url = URL.createObjectURL(audio.blob);
        setState({
          status: 'ready',
          url,
          fileName: audio.fileName,
          origin: audio.origin,
          playable: canPlay(audio.blob),
        });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'missing' });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [chartId, revision]);

  const attach = useCallback(
    async (file: File) => {
      setSaveError(false);
      try {
        await rocksmithLibrary.saveAudio({
          chartId,
          fileName: file.name,
          blob: file,
          origin: 'local',
        });
        setRevision((r) => r + 1);
      } catch {
        setSaveError(true);
      }
    },
    [chartId],
  );

  return { audioState: state, attach, saveError };
}
