import type { LibraryIndexEntry } from './libraryData';
import { formatDuration } from './libraryData';

interface Props {
  tracks: LibraryIndexEntry[];
  selectedSha: string | null;
  onSelect: (track: LibraryIndexEntry) => void;
}

export default function LibraryTrackList({ tracks, selectedSha, onSelect }: Props) {
  if (tracks.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        Nenhuma faixa disponível ainda. Rode o script{' '}
        <code className="font-mono text-xs">sync_workspace_to_public.py</code>{' '}
        para popular a biblioteca.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5" role="list">
      {tracks.map((track) => {
        const isActive = track.source_sha256 === selectedSha;
        return (
          <li key={track.source_sha256}>
            <button
              type="button"
              onClick={() => onSelect(track)}
              aria-current={isActive ? 'true' : undefined}
              className={`w-full text-left px-3 py-2 rounded-button transition-colors cursor-pointer border ${
                isActive
                  ? 'bg-accent/15 border-accent/40 text-text-primary'
                  : 'bg-bg-card border-border-default hover:bg-bg-hover'
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-text-primary truncate">
                  {track.title}
                </span>
                <span className="text-[11px] text-text-muted shrink-0">
                  {formatDuration(track.duration_seconds)}
                </span>
              </div>
              <div className="text-xs text-text-secondary truncate">
                {track.artist}
              </div>
              <div className="text-[11px] text-text-muted mt-0.5">
                {track.detected_key.tonic_name}{' '}
                {track.detected_key.mode === 'minor' ? 'menor' : 'maior'}
                {' · '}
                {Math.round(track.detected_tempo_bpm)} bpm
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
