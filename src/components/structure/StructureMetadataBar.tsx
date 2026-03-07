import { useAppStore } from '@/store/useAppStore';

export default function StructureMetadataBar() {
  const structureTitle = useAppStore((s) => s.structureTitle);
  const structureArtist = useAppStore((s) => s.structureArtist);
  const setStructureTitle = useAppStore((s) => s.setStructureTitle);
  const setStructureArtist = useAppStore((s) => s.setStructureArtist);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      <input
        type="text"
        value={structureTitle}
        onChange={(e) => setStructureTitle(e.target.value)}
        placeholder="Titulo da musica"
        className="w-full sm:flex-1 sm:min-w-[180px] px-3 py-2.5 rounded-lg bg-bg-tertiary border border-border-default text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all"
      />
      <input
        type="text"
        value={structureArtist}
        onChange={(e) => setStructureArtist(e.target.value)}
        placeholder="Artista"
        className="w-full sm:flex-1 sm:min-w-[140px] px-3 py-2.5 rounded-lg bg-bg-tertiary border border-border-default text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all"
      />
    </div>
  );
}
