import { useAppStore } from '@/store/useAppStore';
import { useStructures } from '@/hooks/useStructures';
import { confirmDialog } from '@/services/confirm';

export default function StructureList() {
  const { items: structures, isLoading, remove } = useStructures();
  const loadStructure = useAppStore((s) => s.loadStructure);
  const activeStructureId = useAppStore((s) => s.activeStructureId);

  if (isLoading) {
    return (
      <div className="text-xs text-text-muted py-2">
        Carregando estruturas...
      </div>
    );
  }

  if (structures.length === 0) {
    return null;
  }

  return (
    <div>
      <h4 className="font-heading text-sm text-text-secondary mb-2">
        Estruturas salvas
      </h4>
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
        {structures.map((structure) => {
          const isActive = structure.id === activeStructureId;
          return (
            <div
              key={structure.id}
              className={`relative border ${
                isActive
                  ? 'border-accent bg-bg-tertiary'
                  : 'border-border-default bg-bg-card hover:border-accent hover:shadow-lift'
              }`}
            >
              <button
                type="button"
                aria-current={isActive ? 'true' : undefined}
                onClick={() => loadStructure(structure)}
                className="block w-full h-full text-left px-4 py-3 cursor-pointer"
              >
                <span className="font-heading text-xs text-text-primary block pr-6">
                  {structure.title}
                </span>
                {structure.artist && (
                  <span className="text-micro text-text-muted block mt-0.5">
                    {structure.artist}
                  </span>
                )}

                <span className="flex items-center gap-2 mt-1.5">
                  <span className="text-micro text-text-muted font-mono">
                    {structure.bars.length}c
                  </span>
                  <span className="flex gap-1 flex-wrap">
                    {structure.sections.map((sec) => (
                      <span
                        key={sec.id}
                        className="text-micro font-mono px-1.5 py-0.5"
                        style={{
                          backgroundColor: sec.color + '20',
                          color: sec.color,
                        }}
                      >
                        {sec.name}
                      </span>
                    ))}
                  </span>
                </span>
              </button>

              <button
                type="button"
                aria-label={`Remover ${structure.title}`}
                onClick={async () => {
                  const confirmed = await confirmDialog({
                    title: `Remover "${structure.title}"?`,
                    confirmLabel: 'Remover',
                    danger: true,
                  });
                  if (confirmed) void remove(structure.id);
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
