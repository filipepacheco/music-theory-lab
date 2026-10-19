import { useAppStore } from '@/store/useAppStore';
import Field from '@/components/shared/Field';

export default function StructureMetadataBar() {
  const structureTitle = useAppStore((s) => s.structureTitle);
  const structureArtist = useAppStore((s) => s.structureArtist);
  const structureBpm = useAppStore((s) => s.structureBpm);
  const setStructureTitle = useAppStore((s) => s.setStructureTitle);
  const setStructureArtist = useAppStore((s) => s.setStructureArtist);
  const setStructureBpm = useAppStore((s) => s.setStructureBpm);

  return (
    <div className="structure-metadata">
      <Field
        type="text"
        value={structureTitle}
        onChange={(e) => setStructureTitle(e.target.value)}
        placeholder="Título da música"
        aria-label="Título da música"
        className="min-w-0 w-full"
      />
      <Field
        type="text"
        value={structureArtist}
        onChange={(e) => setStructureArtist(e.target.value)}
        placeholder="Artista"
        aria-label="Artista"
        className="min-w-0 w-full"
      />
      <div className="lh-field flex-none">
        <Field
          type="number"
          aria-label="BPM"
          value={structureBpm}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v) && v >= 20 && v <= 300) setStructureBpm(v);
          }}
          min={20}
          max={300}
          className="w-20 flex-none text-center"
        />
        <span className="lh-label">BPM</span>
      </div>
    </div>
  );
}
