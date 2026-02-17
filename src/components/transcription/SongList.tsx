import { motion } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';
import { useSongs } from '@/hooks/useSongs';
import { SECTION_COLORS } from '@/constants/songSections';

export default function SongList() {
  const loadSong = useAppStore((s) => s.loadSong);
  const activeSongId = useAppStore((s) => s.activeSongId);
  const { songs, isLoading, remove } = useSongs();

  if (isLoading) {
    return (
      <div className="text-xs text-text-muted py-2">
        Carregando musicas...
      </div>
    );
  }

  if (songs.length === 0) {
    return null;
  }

  return (
    <div>
      <h4 className="font-heading text-sm text-text-secondary mb-2">
        Musicas salvas
      </h4>
      <div className="flex gap-2 flex-wrap">
        {songs.map((song) => {
          const isActive = song.id === activeSongId;
          return (
            <motion.button
              key={song.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => loadSong(song)}
              className={`group relative text-left px-4 py-3 rounded-lg border transition-all cursor-pointer ${
                isActive
                  ? 'border-accent bg-accent/10'
                  : 'border-border-default bg-bg-card hover:border-accent/50 hover:shadow-[var(--shadow-card-hover)]'
              }`}
            >
              <span className="font-heading text-xs text-text-primary block pr-6 group-hover:text-accent transition-colors">
                {song.title}
              </span>
              {song.artist && (
                <span className="text-[10px] text-text-muted block mt-0.5">
                  {song.artist}
                </span>
              )}

              {/* Section pills */}
              <div className="flex gap-1 flex-wrap mt-1.5">
                {song.sections.map((sec) => (
                  <span
                    key={sec.id}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: SECTION_COLORS[sec.type] + '20',
                      color: SECTION_COLORS[sec.type],
                    }}
                  >
                    {sec.type}
                  </span>
                ))}
              </div>

              <button
                type="button"
                aria-label={`Remover ${song.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Remover "${song.title}"?`))
                    remove(song.id);
                }}
                className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-full text-[10px] bg-bg-tertiary border border-border-default text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer opacity-60 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-accent"
              >
                X
              </button>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
