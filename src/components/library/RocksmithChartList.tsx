import type { LibrarySong } from '@/domain/librarySong';
import { formatDuration } from '@/components/library/libraryData';
import type { RocksmithImportStatus } from '@/hooks/useRocksmithCharts';

const SOURCE_LABEL = { gp: 'GP', rocksmith: 'Rocksmith', midi: 'MIDI' };
const PART_LABEL = { bass: 'Baixo', drums: 'Bateria' };

interface Props {
  songs: LibrarySong[];
  selectedKey: string | null;
  importStatus: RocksmithImportStatus;
  onSelect: (song: LibrarySong) => void;
  onImport: (file: File) => void;
}

export default function RocksmithChartList({
  songs,
  selectedKey,
  importStatus,
  onSelect,
  onImport,
}: Props) {
  const inputId = 'rocksmith-psarc-input';
  const importing = importStatus.state === 'importing';
  return (
    <div className="flex flex-col gap-2">
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
        <ul className="flex flex-col gap-1.5" role="list">
          {songs.map((song) => {
            const isActive = song.key === selectedKey;
            const duration =
              song.charts[0]?.durationSeconds ??
              song.analysed[0]?.durationSeconds ??
              0;
            return (
              <li key={song.key}>
                <button
                  type="button"
                  onClick={() => onSelect(song)}
                  aria-current={isActive ? 'true' : undefined}
                  className={`w-full text-left px-3 py-2 cursor-pointer border ${
                    isActive
                      ? 'bg-bg-tertiary border-accent text-text-primary'
                      : 'bg-bg-card border-border-default hover:bg-bg-tertiary'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-text-primary truncate">
                      {song.title}
                    </span>
                    <span className="text-small text-text-muted shrink-0">
                      {formatDuration(duration)}
                    </span>
                  </div>
                  <div className="text-xs text-text-secondary truncate">
                    {song.artist}
                  </div>
                  <div className="text-small mt-0.5 flex flex-wrap gap-1">
                    {song.sources.map((source) => (
                      <SongBadge key={source} label={SOURCE_LABEL[source]} />
                    ))}
                    {song.analysed.length > 0 && <SongBadge label="Análise" />}
                    {song.parts.map((part) => (
                      <SongBadge key={part} label={PART_LABEL[part]} />
                    ))}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
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
