import { useEffect, useMemo, useState } from 'react';
import { probeAudioUrl } from './audioSource';
import {
  barIndexAtSeconds,
  buildChordChartBars,
  collapseChartCells,
  fetchTrackAnalyses,
  formatDuration,
  groupBarsBySection,
  sectionColorVar,
  sectionIndexAtSeconds,
  type BeatAnalysisJson,
  type ChordAnalysisJson,
  type ChordChartBar,
  type KeyAnalysisJson,
  type LibraryIndexEntry,
  type SectionAnalysisJson,
  type SectionGroup,
} from './libraryData';
import LibraryPlayer from './LibraryPlayer';
import LibrarySectionTimeline from './LibrarySectionTimeline';
import { useLibraryAudio } from './useLibraryAudio';

interface Props {
  track: LibraryIndexEntry;
}

interface DetailData {
  chord: ChordAnalysisJson;
  beat: BeatAnalysisJson;
  key: KeyAnalysisJson;
  section: SectionAnalysisJson | null;
}

/** `undefined` while the probe is still running, `null` once it found nothing. */
type AudioProbe = string | null | undefined;

const NO_SECTIONS: never[] = [];

export default function LibraryTrackDetail({ track }: Props) {
  const [data, setData] = useState<DetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<AudioProbe>(undefined);

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
    setAudioUrl(undefined);
    probeAudioUrl(track, controller.signal)
      .then((url) => {
        if (!controller.signal.aborted) setAudioUrl(url);
      })
      .catch(() => {
        if (!controller.signal.aborted) setAudioUrl(null);
      });
    return () => controller.abort();
  }, [track]);

  const audio = useLibraryAudio(audioUrl ?? null);

  const bars = useMemo(() => {
    if (!data) return [];
    return buildChordChartBars(
      data.chord,
      data.beat,
      track.duration_seconds,
      data.key,
    );
  }, [data, track.duration_seconds]);

  // Stable identity while loading, so the memos below do not re-run on every
  // render just because `?? []` built a fresh array.
  const sections = data?.section?.sections ?? NO_SECTIONS;

  const sectionGroups = useMemo(
    () => groupBarsBySection(bars, sections),
    [bars, sections],
  );

  const activeBarIndex = useMemo(
    () => (audio.playing ? barIndexAtSeconds(bars, audio.currentSeconds) : -1),
    [audio.playing, audio.currentSeconds, bars],
  );

  const activeSectionIndex = useMemo(
    () =>
      audio.playing ? sectionIndexAtSeconds(sections, audio.currentSeconds) : -1,
    [audio.playing, audio.currentSeconds, sections],
  );

  const seek = audioUrl && audio.ready ? audio.seek : null;

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

      {audioUrl === null && (
        <p className="text-[11px] text-text-muted rounded-button border border-border-default bg-bg-card px-3 py-2">
          Sem áudio para esta faixa — só a análise foi publicada. Rode{' '}
          <code className="font-mono text-[10px]">
            sync_workspace_to_public.py --copy-audio
          </code>{' '}
          para copiar o arquivo original e habilitar a reprodução e o salto por
          compasso.
        </p>
      )}

      {error && (
        <p className="text-sm text-red-400">
          Falha ao carregar detalhes: {error}
        </p>
      )}

      {!data && !error && (
        <p className="text-sm text-text-muted">Carregando cifra…</p>
      )}

      {data && (
        <div className="flex flex-col gap-5">
          {sections.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="font-heading text-sm text-text-secondary">
                Forma detectada
              </h4>
              <LibrarySectionTimeline
                sections={sections}
                durationSeconds={track.duration_seconds}
                activeIndex={activeSectionIndex}
                progressSeconds={audioUrl ? audio.currentSeconds : null}
                onSeek={seek}
              />
              <p className="text-[11px] text-text-muted">
                As letras agrupam trechos que soam parecidos entre si — são
                marcações automáticas, não intro, verso ou refrão.
                {seek ? ' Clique num trecho para saltar até ele.' : ''}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <h4 className="font-heading text-sm text-text-secondary">
              Cifra por compasso
            </h4>

            {sectionGroups.length > 0 ? (
              <div className="flex flex-col gap-3">
                {sectionGroups.map((group) => (
                  <SectionBlock
                    key={group.index}
                    group={group}
                    isActive={group.index === activeSectionIndex}
                    activeBarIndex={activeBarIndex}
                    onSeek={seek}
                  />
                ))}
              </div>
            ) : (
              <ChordCells
                bars={bars}
                activeBarIndex={activeBarIndex}
                onSeek={seek}
              />
            )}

            <p className="text-[11px] text-text-muted">
              Um bloco = um compasso, agrupado a partir do down-beat detectado.
              Compassos seguidos sem acorde detectado viram um bloco só.
              {seek ? ' Clique num bloco para saltar a reprodução até ele.' : ''}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function SectionBlock({
  group,
  isActive,
  activeBarIndex,
  onSeek,
}: {
  group: SectionGroup;
  isActive: boolean;
  activeBarIndex: number;
  onSeek: ((seconds: number) => void) | null;
}) {
  const color = sectionColorVar(group.colorIndex);
  return (
    <div
      className="flex flex-col gap-1.5 pl-2.5"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          className={`font-heading text-sm ${
            isActive ? 'text-text-primary' : 'text-text-secondary'
          }`}
        >
          Trecho {group.section.label}
        </span>
        {group.occurrenceTotal > 1 && (
          <span className="text-[11px] text-text-muted">
            {group.occurrence}ª de {group.occurrenceTotal}
          </span>
        )}
        <span className="text-[11px] text-text-muted ml-auto tabular-nums">
          {formatDuration(group.section.start_seconds)}–
          {formatDuration(group.section.end_seconds)}
          {group.bars.length > 0 &&
            ` · ${group.bars.length} ${
              group.bars.length === 1 ? 'compasso' : 'compassos'
            }`}
        </span>
      </div>
      {group.bars.length > 0 ? (
        <ChordCells
          bars={group.bars}
          activeBarIndex={activeBarIndex}
          onSeek={onSeek}
        />
      ) : (
        <p className="text-[11px] text-text-muted">
          Trecho curto demais para conter um compasso inteiro.
        </p>
      )}
    </div>
  );
}

/** Width of one bar's cell. Collapsed runs are a small multiple of it. */
const CELL_WIDTH_REM = 4;
/** Past this many bars a collapsed run stops growing — it is already clear. */
const MAX_COLLAPSED_SPAN = 3;

function ChordCells({
  bars,
  activeBarIndex,
  onSeek,
}: {
  bars: ChordChartBar[];
  activeBarIndex: number;
  onSeek: ((seconds: number) => void) | null;
}) {
  const cells = useMemo(() => collapseChartCells(bars), [bars]);

  return (
    <div className="flex flex-wrap gap-1">
      {cells.map((cell) => {
        const isActive = cell.bars.some((b) => b.index === activeBarIndex);
        const widthUnits = Math.min(cell.span, MAX_COLLAPSED_SPAN);
        const className = [
          'rounded-button border px-2 py-1 flex flex-col items-start justify-center',
          'text-left leading-tight transition-colors',
          isActive
            ? 'border-text-primary bg-bg-hover'
            : 'border-border-default bg-bg-card',
          onSeek ? 'hover:border-text-primary cursor-pointer' : 'cursor-default',
        ].join(' ');
        return (
          <button
            key={cell.bars[0].index}
            type="button"
            onClick={onSeek ? () => onSeek(cell.startSeconds) : undefined}
            disabled={onSeek === null}
            title={`${cell.chord} · ${formatDuration(
              cell.startSeconds,
            )}–${formatDuration(cell.endSeconds)}`}
            className={className}
            style={{
              width: `calc(${widthUnits} * ${CELL_WIDTH_REM}rem + ${
                widthUnits - 1
              } * 0.25rem)`,
            }}
          >
            <span className="flex items-baseline gap-1">
              <span className="font-heading text-sm text-text-primary">
                {cell.chord}
              </span>
              {cell.romanNumeral && (
                <span className="font-heading text-[10px] text-text-secondary">
                  {cell.romanNumeral}
                </span>
              )}
              {cell.span > 1 && (
                <span className="font-heading text-[10px] text-text-secondary">
                  ×{cell.span}
                </span>
              )}
            </span>
            <span className="text-[9px] text-text-muted tabular-nums">
              {formatDuration(cell.startSeconds)}
            </span>
          </button>
        );
      })}
    </div>
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
