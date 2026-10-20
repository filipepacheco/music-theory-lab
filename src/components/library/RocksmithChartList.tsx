import Callout from '@/components/shared/Callout';
import { useMemo } from 'react';
import Field from '@/components/shared/Field';
import Select from '@/components/shared/Select';
import {
  applyListView,
  DEFAULT_LIST_VIEW,
  isNarrowed,
  tuningOptions,
  type ListView,
} from '@/domain/libraryListView';
import type { LibrarySong } from '@/domain/librarySong';
import { formatLibraryRoute, routeOfSong } from '@/domain/libraryRoute';
import { formatDuration } from '@/components/library/libraryData';
import { readLastSource } from '@/components/library/lastSource';
import type { RocksmithImportStatus } from '@/hooks/useRocksmithCharts';

const SOURCE_LABEL = { gp: 'GP', rocksmith: 'Rocksmith', midi: 'MIDI' };
const PART_LABEL = { bass: 'Baixo', drums: 'Bateria' };
const HEADINGS = [
  'Título',
  'Artista',
  'Partes',
  'Andamento',
  'Duração',
  'Importado em',
];

interface Props {
  songs: LibrarySong[];
  view: ListView;
  onViewChange: (view: ListView) => void;
  linkedChartIds: ReadonlySet<string>;
  importStatus: RocksmithImportStatus;
  onSelect: (song: LibrarySong) => void;
  onImport: (file: File) => void;
}

function tempoOf(song: LibrarySong): string {
  const tempo = song.charts[0]?.tempoBpm;
  return tempo ? `${Math.round(tempo)} BPM` : '—';
}

function durationOf(song: LibrarySong): string {
  const seconds =
    song.charts[0]?.durationSeconds ?? song.analysed[0]?.durationSeconds;
  return seconds ? formatDuration(seconds) : '—';
}

function importedOf(song: LibrarySong): string {
  const latest = song.charts
    .map((chart) => chart.importedAt)
    .sort()
    .pop();
  const date = latest ? new Date(latest) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('pt-BR')
    : '—';
}

export default function RocksmithChartList({
  songs: allSongs,
  view,
  onViewChange,
  linkedChartIds,
  importStatus,
  onSelect,
  onImport,
}: Props) {
  const inputId = 'rocksmith-psarc-input';
  const importing = importStatus.state === 'importing';
  const songs = useMemo(
    () => applyListView(allSongs, view, linkedChartIds),
    [allSongs, view, linkedChartIds],
  );
  const tunings = useMemo(() => tuningOptions(allSongs), [allSongs]);
  const set = (patch: Partial<ListView>) => onViewChange({ ...view, ...patch });
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="lh-label">Linhas de baixo</h3>
        <label
          htmlFor={inputId}
          aria-disabled={importing}
          className={`font-heading text-xs px-3 py-1.5 bg-bg-tertiary text-text-primary ${
            importing
              ? 'opacity-50 cursor-wait'
              : 'hover:bg-accent hover:text-on-accent cursor-pointer'
          }`}
        >
          Importar .psarc / .mid / .gp
        </label>
        <input
          id={inputId}
          type="file"
          disabled={importing}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) onImport(file);
          }}
        />
      </div>

      {importStatus.state === 'importing' && (
        <p role="status" className="text-small text-text-muted">
          Lendo {importStatus.fileName}…
        </p>
      )}
      {importStatus.state === 'imported' && !importStatus.hasAudio && (
        <p role="status" className="text-small text-text-muted">
          Importado sem áudio: vincule a gravação na faixa.
        </p>
      )}
      {importStatus.state === 'error' && (
        <Callout tone="danger" role="alert">
          {importStatus.message}
        </Callout>
      )}

      <div className="library-list-columns">
        {allSongs.length > 0 && (
          <div className="library-filters" role="search">
            <Field
              type="search"
              prompt=">"
              aria-label="Buscar por título ou artista"
              placeholder="Buscar título ou artista"
              value={view.search}
              onChange={(event) => set({ search: event.target.value })}
              className="w-full min-w-0"
            />
            <Select
              aria-label="Fonte"
              value={view.source}
              onChange={(event) =>
                set({ source: event.target.value as ListView['source'] })
              }
            >
              <option value="all">Fonte: todas</option>
              <option value="gp">GP</option>
              <option value="rocksmith">Rocksmith</option>
              <option value="midi">MIDI</option>
              <option value="analysis">Análise</option>
            </Select>
            <Select
              aria-label="Parte"
              value={view.part}
              onChange={(event) =>
                set({ part: event.target.value as ListView['part'] })
              }
            >
              <option value="all">Parte: todas</option>
              <option value="bass">Baixo</option>
              <option value="drums">Bateria</option>
            </Select>
            <Select
              aria-label="Afinação"
              value={view.tuning}
              onChange={(event) => set({ tuning: event.target.value })}
            >
              <option value="all">Afinação: todas</option>
              {tunings.map((tuning) => (
                <option key={tuning} value={tuning}>
                  {tuning}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Gravação vinculada"
              value={view.linked}
              onChange={(event) =>
                set({ linked: event.target.value as ListView['linked'] })
              }
            >
              <option value="all">Gravação: todas</option>
              <option value="linked">Com gravação</option>
              <option value="unlinked">Sem gravação</option>
            </Select>
            <Select
              aria-label="Ordenar por"
              value={view.sort}
              onChange={(event) =>
                set({ sort: event.target.value as ListView['sort'] })
              }
            >
              <option value="imported">Ordem: importação</option>
              <option value="title">Ordem: título</option>
              <option value="artist">Ordem: artista</option>
              <option value="tempo">Ordem: andamento</option>
            </Select>
          </div>
        )}

        {allSongs.length === 0 ? (
          <p className="text-small text-text-muted">
            Importe Rocksmith 2014 (.psarc), MIDI (.mid) ou Guitar Pro 7/8 (.gp)
            para ver a linha de baixo compasso a compasso, tocando junto com a
            música.
          </p>
        ) : songs.length === 0 ? (
          <div role="status" className="flex flex-col items-start gap-1">
            <p className="text-small text-text-muted">
              Nenhuma música encontrada com esta busca e estes filtros.
            </p>
            {isNarrowed(view) && (
              <button
                type="button"
                onClick={() =>
                  onViewChange({ ...DEFAULT_LIST_VIEW, sort: view.sort })
                }
                className="text-small text-accent underline"
              >
                Limpar busca e filtros
              </button>
            )}
          </div>
        ) : (
          <table className="library-song-table block w-full border-collapse text-left">
            <thead className="sr-only">
              <tr className="border-b border-border-default">
                {HEADINGS.map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="lh-label px-3 py-2 font-normal"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="block">
              {songs.map((song) => (
                <tr
                  key={song.key}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest('a')) return;
                    onSelect(song);
                  }}
                  className="mb-1.5 flex cursor-pointer flex-wrap items-baseline gap-x-3 border border-border-default bg-bg-card px-3 py-2 hover:bg-bg-tertiary"
                >
                  <td className="w-full min-w-0">
                    <a
                      href={formatLibraryRoute(
                        routeOfSong(song, readLastSource(song.key)),
                      )}
                      className="font-medium text-text-primary hover:underline"
                    >
                      {song.title}
                    </a>
                  </td>
                  <td className="w-full min-w-0 text-xs text-text-secondary">
                    {song.artist}
                  </td>
                  <td className="w-full text-small">
                    <span className="flex flex-wrap gap-1">
                      {song.sources.map((source) => (
                        <SongBadge key={source} label={SOURCE_LABEL[source]} />
                      ))}
                      {song.analysed.length > 0 && (
                        <SongBadge label="Análise" />
                      )}
                      {song.parts.map((part) => (
                        <SongBadge key={part} label={PART_LABEL[part]} />
                      ))}
                    </span>
                  </td>
                  <td className="text-small text-text-muted">
                    {tempoOf(song)}
                  </td>
                  <td className="text-small text-text-muted">
                    {durationOf(song)}
                  </td>
                  <td className="text-small text-text-muted">
                    {importedOf(song)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SongBadge({ label }: { label: string }) {
  return (
    <span className="border border-border-default px-1.5 text-text-secondary">
      {label}
    </span>
  );
}
