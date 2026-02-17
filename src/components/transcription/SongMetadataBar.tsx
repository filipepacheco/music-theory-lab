import { useAppStore } from '@/store/useAppStore';
import { getNoteName } from '@/utils/noteHelpers';
import HearKeyButton from './HearKeyButton';

export default function SongMetadataBar() {
  const songTitle = useAppStore((s) => s.songTitle);
  const songArtist = useAppStore((s) => s.songArtist);
  const setSongTitle = useAppStore((s) => s.setSongTitle);
  const setSongArtist = useAppStore((s) => s.setSongArtist);
  const rootNote = useAppStore((s) => s.rootNote);
  const isMinor = useAppStore((s) => s.isMinor);

  const keyDisplay = `${getNoteName(rootNote)} ${isMinor ? 'menor' : 'maior'}`;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="text"
        value={songTitle}
        onChange={(e) => setSongTitle(e.target.value)}
        placeholder="Titulo da musica"
        className="flex-1 min-w-[180px] px-3 py-2 rounded-lg bg-bg-tertiary border border-border-default text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
      />
      <input
        type="text"
        value={songArtist}
        onChange={(e) => setSongArtist(e.target.value)}
        placeholder="Artista"
        className="flex-1 min-w-[140px] px-3 py-2 rounded-lg bg-bg-tertiary border border-border-default text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
      />
      <span className="text-xs font-mono text-text-secondary px-3 py-2 rounded-lg bg-bg-tertiary border border-border-default">
        {keyDisplay}
      </span>
      <HearKeyButton />
    </div>
  );
}
