import { useEffect, useMemo, useState } from 'react';
import BassNeck from '@/components/instruments/BassNeck';
import { resolveLibraryChordAt } from '@/domain/libraryChordSync';
import {
  createLibraryAnnotation,
  type LibraryAnnotationDocument,
  type LibraryAnnotationEditResult,
} from '@/domain/libraryAnnotation';
import {
  useLibraryAudioSource,
  type AudioAttachmentStatus,
} from '@/hooks/useLibraryAudioSource';
import { savedLibrary } from '@/services/savedLibrary';
import {
  barIndexAtSeconds,
  buildChordChartBars,
  collapseChartCells,
  fetchTrackAnalyses,
  formatDuration,
  groupBarsBySection,
  sectionColorVar,
  sectionBoundaryBars,
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
import LibrarySectionEditor from '@/components/library/LibrarySectionEditor';
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

const NO_SECTIONS: never[] = [];

export default function LibraryTrackDetail({ track }: Props) {
  const [data, setData] = useState<DetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [annotation, setAnnotation] =
    useState<LibraryAnnotationDocument | null>(null);
  const [annotationError, setAnnotationError] = useState<string | null>(null);
  const { audioSource, attachmentStatus, attachAudio } =
    useLibraryAudioSource(track);

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

  const audioUrl = audioSource.status === 'ready' ? audioSource.url : null;

  const audio = useLibraryAudio(audioUrl);

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

  const editableSections = useMemo(
    () => annotationSections(annotation, bars),
    [annotation, bars],
  );

  const sectionGroups = useMemo(
    () => groupBarsBySection(bars, editableSections),
    [bars, editableSections],
  );

  const activeBarIndex = useMemo(
    () => (audio.playing ? barIndexAtSeconds(bars, audio.currentSeconds) : -1),
    [audio.playing, audio.currentSeconds, bars],
  );

  const activeSectionIndex = useMemo(
    () =>
      audio.playing
        ? sectionIndexAtSeconds(editableSections, audio.currentSeconds)
        : -1,
    [audio.playing, audio.currentSeconds, editableSections],
  );

  useEffect(() => {
    if (!data || bars.length === 0) return;
    let cancelled = false;
    setAnnotation(null);
    setAnnotationError(null);
    savedLibrary.libraryAnnotations
      .get(track.source_sha256, bars.length)
      .then(async (saved) => {
        if (cancelled) return;
        const initial =
          saved ??
          createLibraryAnnotation(
            track.source_sha256,
            bars.length,
            sectionBoundaryBars(bars, sections),
          );
        setAnnotation(initial);
        if (!saved) await savedLibrary.libraryAnnotations.save(initial);
      })
      .catch(() => {
        if (!cancelled) {
          setAnnotationError('Falha ao carregar as seções salvas desta faixa.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bars, data, sections, track.source_sha256]);

  const editAnnotation = (result: LibraryAnnotationEditResult) => {
    if (result.error) {
      setAnnotationError(result.error);
      return;
    }
    setAnnotation(result.document);
    setAnnotationError(null);
    savedLibrary.libraryAnnotations.save(result.document).catch(() => {
      setAnnotationError('Falha ao salvar esta edição localmente.');
    });
  };

  const seek = audioUrl && audio.ready ? audio.seek : null;

  const activeChord = useMemo(
    () =>
      resolveLibraryChordAt(
        data?.chord.segments ?? [],
        audioUrl && audio.ready ? audio.currentSeconds : Number.NaN,
      ),
    [audio.currentSeconds, audio.ready, audioUrl, data?.chord.segments],
  );

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <header>
        <h3 className="font-heading text-base text-text-primary">
          {track.title}
        </h3>
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

      <LocalAudioAttachment
        fileName={
          audioSource.status === 'ready' ? audioSource.localFileName : null
        }
        status={attachmentStatus}
        onSelect={attachAudio}
      />

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
          <div className="rounded-card border border-border-default bg-bg-card p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="font-heading text-sm text-text-secondary">
                Braço sincronizado
              </h4>
              <p className="font-heading text-sm text-text-primary tabular-nums">
                {activeChord.text
                  ? `Acorde atual: ${activeChord.text}`
                  : 'Nenhum acorde ativo'}
              </p>
            </div>
            <BassNeck
              highlight={{
                pitchClasses: activeChord.pitchClasses,
                rootPitchClass: activeChord.rootPitchClass,
              }}
            />
            <p className="mt-2 text-[11px] text-text-muted">
              A fundamental aparece em âmbar; as demais notas do acorde, em
              verde.
            </p>
          </div>

          {annotation && (
            <div className="flex flex-col gap-2">
              <h4 className="font-heading text-sm text-text-secondary">
                Seções da faixa
              </h4>
              <LibrarySectionEditor
                document={annotation}
                bars={bars}
                activeSectionIndex={activeSectionIndex}
                onEdit={editAnnotation}
              />
              <p className="text-[11px] text-text-muted">
                Renomeie no cabeçalho, clique em um compasso para dividir ou use
                a fronteira para mover um compasso e unir seções. A ordem
                original da gravação não muda.
              </p>
              {annotationError && (
                <p className="text-[11px] text-red-400">{annotationError}</p>
              )}
            </div>
          )}

          {annotationError && !annotation && (
            <p className="text-[11px] text-red-400">{annotationError}</p>
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
              {seek
                ? ' Clique num bloco para saltar a reprodução até ele.'
                : ''}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function LocalAudioAttachment({
  fileName,
  status,
  onSelect,
}: {
  fileName: string | null;
  status: AudioAttachmentStatus;
  onSelect: (file: File) => Promise<void>;
}) {
  const inputId = 'library-local-audio';
  const message = {
    idle: null,
    checking: 'Verificando o arquivo pelo SHA-256…',
    attached: 'Áudio local vinculado com sucesso.',
    mismatch:
      'Este arquivo não corresponde à análise. Escolha a gravação original desta faixa.',
    unreadable:
      'Não foi possível ler este arquivo. Confira o arquivo e tente novamente.',
    'storage-error':
      'Não foi possível salvar o áudio neste navegador. Verifique o espaço disponível e tente novamente.',
  }[status];
  const isError =
    status === 'mismatch' ||
    status === 'unreadable' ||
    status === 'storage-error';

  return (
    <div className="rounded-button border border-border-default bg-bg-card px-3 py-2 flex flex-col items-start gap-2">
      <div>
        <p className="text-xs text-text-secondary">
          {fileName
            ? `Áudio local: ${fileName}`
            : 'O áudio original ainda não está vinculado a esta análise.'}
        </p>
        <p className="text-[11px] text-text-muted">
          O arquivo permanece somente neste navegador e não é enviado para a
          nuvem.
        </p>
      </div>
      <label
        htmlFor={inputId}
        className="font-heading text-xs px-3 py-1.5 rounded-button bg-bg-elevated text-text-primary hover:bg-bg-hover cursor-pointer"
      >
        {fileName ? 'Trocar arquivo local' : 'Vincular áudio original'}
      </label>
      <input
        id={inputId}
        type="file"
        accept="audio/*"
        disabled={status === 'checking'}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void onSelect(file);
        }}
      />
      {message && (
        <p
          role={isError ? 'alert' : 'status'}
          className={`text-[11px] ${
            isError ? 'text-red-400' : 'text-text-muted'
          }`}
        >
          {message}
        </p>
      )}
    </div>
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
          onSeek
            ? 'hover:border-text-primary cursor-pointer'
            : 'cursor-default',
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

function annotationSections(
  annotation: LibraryAnnotationDocument | null,
  bars: ChordChartBar[],
): SectionAnalysisJson['sections'] {
  if (!annotation) return [];
  return annotation.sections.map((section) => ({
    start_seconds: bars[section.startBar]?.startSeconds ?? 0,
    end_seconds:
      bars[section.endBar - 1]?.endSeconds ??
      bars[bars.length - 1]?.endSeconds ??
      0,
    label: section.name,
  }));
}
