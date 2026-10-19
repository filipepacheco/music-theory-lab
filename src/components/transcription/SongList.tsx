import { useAppStore } from '@/store/useAppStore';
import { useSongs } from '@/hooks/useSongs';
import { SECTION_COLORS } from '@/constants/songSections';
import { confirmDialog } from '@/services/confirm';

export default function SongList() {
  const loadSong = useAppStore((s) => s.loadSong);
  const activeSongId = useAppStore((s) => s.activeSongId);
  const { songs, isLoading, remove } = useSongs();

  if (isLoading) {
    return (
      <div className="text-xs text-text-muted py-2">Carregando músicas...</div>
    );
  }

  if (songs.length === 0) {
    return null;
  }

  return (
    <div>
      <h4 className="font-heading text-sm text-text-secondary mb-2">
        Músicas salvas
      </h4>
      <div className="flex gap-2 flex-wrap">
        {songs.map((song) => {
          const isActive = song.id === activeSongId;
          return (
            <div
              key={song.id}
              className={`relative border ${
                isActive
                  ? 'border-accent bg-bg-tertiary'
                  : 'border-border-default bg-bg-card hover:border-accent hover:shadow-lift'
              }`}
            >
              <button
                type="button"
                aria-current={isActive ? 'true' : undefined}
                onClick={() => loadSong(song)}
                className="block w-full h-full text-left px-4 py-3 cursor-pointer"
              >
                <span className="font-heading text-xs text-text-primary block pr-6">
                  {song.title}
                </span>
                {song.artist && (
                  <span className="text-micro text-text-muted block mt-0.5">
                    {song.artist}
                  </span>
                )}

                <span className="flex gap-1 flex-wrap mt-1.5">
                  {song.sections.map((sec) => (
                    <span
                      key={sec.id}
                      className="text-micro font-mono px-1.5 py-0.5"
                      style={{
                        backgroundColor: SECTION_COLORS[sec.type] + '20',
                        color: SECTION_COLORS[sec.type],
                      }}
                    >
                      {sec.customLabel || sec.type}
                    </span>
                  ))}
                </span>
              </button>

              <button
                type="button"
                aria-label={`Remover ${song.title}`}
                onClick={async () => {
                  const confirmed = await confirmDialog({
                    title: `Remover "${song.title}"?`,
                    confirmLabel: 'Remover',
                    danger: true,
                  });
                  if (confirmed) remove(song.id);
                }}
                className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center text-micro bg-bg-tertiary border border-border-default text-text-muted hover:bg-danger hover:text-on-accent cursor-pointer opacity-60 hover:opacity-100"
              >
                X
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
