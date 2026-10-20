import { useRef } from 'react';
import { useOverflowHint } from '@/hooks/useOverflowHint';
import { useAppStore } from '@/store/useAppStore';
import type { ActiveModule } from '@/types';

const MODULES: { id: ActiveModule; label: string; devOnly?: boolean }[] = [
  { id: 'harmonicField', label: 'Campo Harmônico' },
  { id: 'progressions', label: 'Progressões' },
  { id: 'scales', label: 'Escalas' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'transcription', label: 'Transcrição' },
  { id: 'structure', label: 'Estrutura' },
  { id: 'library', label: 'Biblioteca' },
  { id: 'analyze', label: 'Analisar', devOnly: true },
];

const VISIBLE_MODULES = MODULES.filter(
  (mod) => !mod.devOnly || import.meta.env.DEV,
);

export default function ModuleNav() {
  const activeModule = useAppStore((s) => s.activeModule);
  const setActiveModule = useAppStore((s) => s.setActiveModule);

  const ref = useRef<HTMLElement>(null);
  const edges = useOverflowHint(ref);

  return (
    <div className="min-w-0 max-w-full">
      <nav
        ref={ref}
        className="lh-tabs overflow-x-auto scrollbar-none max-w-full"
        aria-label="Módulos"
      >
        {VISIBLE_MODULES.map((mod) => {
          const isActive = activeModule === mod.id;
          return (
            <button
              key={mod.id}
              onClick={() => setActiveModule(mod.id)}
              aria-current={isActive ? 'page' : undefined}
              className="lh-tab shrink-0"
            >
              {mod.label}
            </button>
          );
        })}
      </nav>
      {(edges.before || edges.after) && (
        <p className="text-meta text-text-muted" role="status">
          {edges.before ? '← ' : ''}Deslize para ver mais módulos
          {edges.after ? ' →' : ''}
        </p>
      )}
    </div>
  );
}
