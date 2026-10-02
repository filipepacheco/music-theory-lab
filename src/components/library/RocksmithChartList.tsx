import type { BassChart } from '@/domain/bassChart';
import { formatDuration } from '@/components/library/libraryData';
import type { RocksmithImportStatus } from '@/hooks/useRocksmithCharts';

interface Props {
  charts: BassChart[];
  selectedId: string | null;
  importStatus: RocksmithImportStatus;
  onSelect: (chart: BassChart) => void;
  onImport: (file: File) => void;
}

export default function RocksmithChartList({
  charts,
  selectedId,
  importStatus,
  onSelect,
  onImport,
}: Props) {
  const inputId = 'rocksmith-psarc-input';
  const importing = importStatus.state === 'importing';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-heading text-xs uppercase tracking-wide text-text-muted">
          Linhas de baixo
        </h3>
        <label
          htmlFor={inputId}
          aria-disabled={importing}
          className={`font-heading text-xs px-3 py-1.5 rounded-button bg-bg-elevated text-text-primary ${
            importing
              ? 'opacity-50 cursor-wait'
              : 'hover:bg-bg-hover cursor-pointer'
          }`}
        >
          Importar .psarc / .mid
        </label>
        <input
          id={inputId}
          type="file"
          accept=".psarc,.mid,.midi"
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
        <p role="status" className="text-[11px] text-text-muted">
          Lendo {importStatus.fileName}…
        </p>
      )}
      {importStatus.state === 'imported' && !importStatus.hasAudio && (
        <p role="status" className="text-[11px] text-text-muted">
          Importado sem áudio: vincule a gravação na faixa.
        </p>
      )}
      {importStatus.state === 'error' && (
        <p role="alert" className="text-[11px] text-text-error">
          {importStatus.message}
        </p>
      )}

      {charts.length === 0 ? (
        <p className="text-[11px] text-text-muted">
          Importe um pacote Rocksmith 2014 (.psarc) ou um MIDI (.mid) para ver a
          linha de baixo compasso a compasso, tocando junto com a música.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5" role="list">
          {charts.map((chart) => {
            const isActive = chart.id === selectedId;
            return (
              <li key={chart.id}>
                <button
                  type="button"
                  onClick={() => onSelect(chart)}
                  aria-current={isActive ? 'true' : undefined}
                  className={`w-full text-left px-3 py-2 rounded-button transition-colors cursor-pointer border ${
                    isActive
                      ? 'bg-accent/15 border-accent/40 text-text-primary'
                      : 'bg-bg-card border-border-default hover:bg-bg-hover'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-text-primary truncate">
                      {chart.title}
                    </span>
                    <span className="text-[11px] text-text-muted shrink-0">
                      {formatDuration(chart.songLengthSeconds)}
                    </span>
                  </div>
                  <div className="text-xs text-text-secondary truncate">
                    {chart.artist}
                  </div>
                  <div className="text-[11px] text-text-muted mt-0.5">
                    Baixo · {chart.notes.length} notas · ~
                    {Math.round(chart.averageTempoBpm)} bpm
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
