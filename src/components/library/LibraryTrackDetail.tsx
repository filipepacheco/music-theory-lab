import { useEffect, useMemo, useState } from 'react';
import { probeAudioUrl } from './audioSource';
import {
  barIndexAtSeconds,
  buildChordChartBars,
  fetchTrackAnalyses,
  formatDuration,
  type BeatAnalysisJson,
  type ChordAnalysisJson,
  type KeyAnalysisJson,
  type LibraryIndexEntry,
} from './libraryData';
import LibraryPlayer from './LibraryPlayer';
import { useLibraryAudio } from './useLibraryAudio';

interface Props {
  track: LibraryIndexEntry;
}

interface DetailData {
  chord: ChordAnalysisJson;
  beat: BeatAnalysisJson;
  key: KeyAnalysisJson;
}

const BARS_PER_ROW = 4;

export default function LibraryTrackDetail({ track }: Props) {
  const [data, setData] = useState<DetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(null);
    fetchTrackAnalyses(track, controller.signal)
      .then(setData)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      });
    return () => controller.abort();
  }, [track]);

  useEffect(() => {
    const controller = new AbortController();
    setAudioUrl(null);
    probeAudioUrl(track, controller.signal)
      .then((url) => {
        if (!controller.signal.aborted) setAudioUrl(url);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [track]);

  const audio = useLibraryAudio(audioUrl);

  const bars = useMemo(() => {
    if (!data) return [];
    return buildChordChartBars(data.chord, data.beat, track.duration_seconds);
  }, [data, track.duration_seconds]);

  const rows = useMemo(() => {
    const grouped: (typeof bars)[] = [];
    for (let i = 0; i < bars.length; i += BARS_PER_ROW) {
      grouped.push(bars.slice(i, i + BARS_PER_ROW));
    }
    return grouped;
  }, [bars]);

  const activeBarIndex = useMemo(
    () => (audio.playing ? barIndexAtSeconds(bars, audio.currentSeconds) : -1),
    [audio.playing, audio.currentSeconds, bars],
  );

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h3 className="font-heading text-base text-text-primary">{track.title}</h3>
        <p className="text-sm text-text-secondary">{track.artist}</p>
      </header>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat
          label="Tom"
          value={`${track.detected_key.tonic_name} ${
            track.detected_key.mode === 'minor' ? 'menor' : 'maior'
          }`}
        />
        <Stat
          label="Andamento"
          value={`${Math.round(track.detected_tempo_bpm)} bpm`}
        />
        <Stat label="Duração" value={formatDuration(track.duration_seconds)} />
        <Stat label="Compassos" value={String(track.downbeat_count)} />
      </dl>

      {audioUrl && <LibraryPlayer audio={audio} />}

      {error && (
        <p className="text-sm text-red-400">
          Falha ao carregar detalhes: {error}
        </p>
      )}

      {!data && !error && (
        <p className="text-sm text-text-muted">Carregando cifra…</p>
      )}

      {data && (
        <div className="flex flex-col gap-2">
          <h4 className="font-heading text-sm text-text-secondary">
            Cifra por compasso
          </h4>
          <div className="flex flex-col gap-1.5">
            {rows.map((row, rowIndex) => (
              <div
                key={rowIndex}
                className="grid gap-1.5"
                style={{
                  gridTemplateColumns: `repeat(${BARS_PER_ROW}, minmax(0, 1fr))`,
                }}
              >
                {row.map((bar) => {
                  const isActive = bar.index === activeBarIndex;
                  const clickable = audioUrl !== null && audio.ready;
                  const className = [
                    'rounded-button border px-2 py-2 flex flex-col gap-0.5 text-left transition-colors',
                    isActive
                      ? 'border-text-primary bg-bg-hover'
                      : 'border-border-default bg-bg-card',
                    clickable
                      ? 'hover:border-text-primary cursor-pointer'
                      : 'cursor-default',
                  ].join(' ');
                  return (
                    <button
                      key={bar.index}
                      type="button"
                      onClick={() => audio.seek(bar.startSeconds)}
                      disabled={!clickable}
                      className={className}
                    >
                      <span className="font-heading text-sm text-text-primary">
                        {bar.chords[0].chord}
                      </span>
                      <span className="text-[10px] text-text-muted">
                        {formatDuration(bar.startSeconds)}
                      </span>
                    </button>
                  );
                })}
                {row.length < BARS_PER_ROW &&
                  Array.from({ length: BARS_PER_ROW - row.length }).map(
                    (_, gap) => <div key={`gap-${gap}`} />,
                  )}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-text-muted">
            Um bloco = um compasso, agrupado a partir do down-beat detectado.
            Quando duas cifras compartilham o compasso, mostramos a de maior
            duração.
            {audioUrl
              ? ' Clique num compasso para saltar a reprodução até ele.'
              : ''}
          </p>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-button bg-bg-card border border-border-default px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd className="font-heading text-sm text-text-primary mt-0.5">{value}</dd>
    </div>
  );
}
