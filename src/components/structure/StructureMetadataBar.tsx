import { useAppStore } from '@/store/useAppStore';

export default function StructureMetadataBar() {
  const structureTitle = useAppStore((s) => s.structureTitle);
  const structureArtist = useAppStore((s) => s.structureArtist);
  const setStructureTitle = useAppStore((s) => s.setStructureTitle);
  const setStructureArtist = useAppStore((s) => s.setStructureArtist);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="text"
        value={structureTitle}
        onChange={(e) => setStructureTitle(e.target.value)}
        placeholder="Titulo da musica"
        className="flex-1 min-w-[180px] px-3 py-2 rounded-lg bg-bg-tertiary border border-border-default text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
      />
      <input
        type="text"
        value={structureArtist}
        onChange={(e) => setStructureArtist(e.target.value)}
        placeholder="Artista"
        className="flex-1 min-w-[140px] px-3 py-2 rounded-lg bg-bg-tertiary border border-border-default text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
      />
    </div>
  );
}
