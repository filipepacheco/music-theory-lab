import type { LibrarySong } from '@/domain/librarySong';
import { formatLibraryRoute, routeOfSong } from '@/domain/libraryRoute';
import { formatDuration } from '@/components/library/libraryData';
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
  songs,
  importStatus,
  onSelect,
  onImport,
}: Props) {
  const inputId = 'rocksmith-psarc-input';
  const importing = importStatus.state === 'importing';
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
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
          accept=".psarc,.mid,.midi,.gp"
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
        <p role="alert" className="text-small text-text-error">
          {importStatus.message}
        </p>
      )}

      {songs.length === 0 ? (
        <p className="text-small text-text-muted">
          Importe Rocksmith 2014 (.psarc), MIDI (.mid) ou Guitar Pro 7/8 (.gp)
          para ver a linha de baixo compasso a compasso, tocando junto com a
          música.
        </p>
      ) : (
        <table className="block w-full border-collapse text-left sm:table">
          <thead className="sr-only sm:not-sr-only sm:table-header-group">
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
          <tbody className="block sm:table-row-group">
            {songs.map((song) => (
              <tr
                key={song.key}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('a')) return;
                  onSelect(song);
                }}
                className="mb-1.5 flex cursor-pointer flex-wrap items-baseline gap-x-3 border border-border-default bg-bg-card px-3 py-2 hover:bg-bg-tertiary sm:mb-0 sm:table-row sm:border-0 sm:border-b sm:p-0"
              >
                <td className="w-full min-w-0 sm:table-cell sm:w-auto sm:px-3 sm:py-2">
                  <a
                    href={formatLibraryRoute(routeOfSong(song))}
                    className="font-medium text-text-primary hover:underline"
                  >
                    {song.title}
                  </a>
                </td>
                <td className="w-full min-w-0 text-xs text-text-secondary sm:table-cell sm:w-auto sm:px-3 sm:py-2">
                  {song.artist}
                </td>
                <td className="w-full text-small sm:table-cell sm:w-auto sm:px-3 sm:py-2">
                  <span className="flex flex-wrap gap-1">
                    {song.sources.map((source) => (
                      <SongBadge key={source} label={SOURCE_LABEL[source]} />
                    ))}
                    {song.analysed.length > 0 && <SongBadge label="Análise" />}
                    {song.parts.map((part) => (
                      <SongBadge key={part} label={PART_LABEL[part]} />
                    ))}
                  </span>
                </td>
                <td className="text-small text-text-muted sm:table-cell sm:px-3 sm:py-2">
                  {tempoOf(song)}
                </td>
                <td className="text-small text-text-muted sm:table-cell sm:px-3 sm:py-2">
                  {durationOf(song)}
                </td>
                <td className="text-small text-text-muted sm:table-cell sm:px-3 sm:py-2">
                  {importedOf(song)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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
