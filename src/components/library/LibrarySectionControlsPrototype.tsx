// THROWAWAY PROTOTYPE: three Library section-editing layouts, switchable with
// ?prototype=sections&variant=A|B|C on the existing Library detail surface.
import { useEffect, useMemo, useState } from 'react';
import type { ChordChartBar } from './libraryData';

interface Props {
  bars: ChordChartBar[];
}

interface PrototypeSection {
  id: string;
  name: string;
  bars: ChordChartBar[];
}

type VariantKey = 'A' | 'B' | 'C';

const VARIANTS: { key: VariantKey; name: string }[] = [
  { key: 'A', name: 'Faixa cronológica' },
  { key: 'B', name: 'Seção + inspetor' },
  { key: 'C', name: 'Mesa de fronteiras' },
];

export default function LibrarySectionControlsPrototype({ bars }: Props) {
  const [variant, setVariant] = useState<VariantKey>(readVariant);
  const [sections, setSections] = useState<PrototypeSection[]>(() =>
    createInitialSections(bars.slice(0, 20)),
  );
  const [selectedSectionId, setSelectedSectionId] = useState(
    () => createInitialSections(bars.slice(0, 20))[0]?.id ?? '',
  );

  useEffect(() => {
    const next = createInitialSections(bars.slice(0, 20));
    setSections(next);
    setSelectedSectionId(next[0]?.id ?? '');
  }, [bars]);

  const actions = useMemo(
    () => ({
      rename: (sectionId: string, name: string) => {
        setSections((current) =>
          current.map((section) =>
            section.id === sectionId ? { ...section, name } : section,
          ),
        );
      },
      splitBefore: (sectionId: string, barIndex: number) => {
        setSections((current) => {
          const index = current.findIndex(
            (section) => section.id === sectionId,
          );
          const section = current[index];
          if (!section) return current;
          const splitIndex = section.bars.findIndex(
            (bar) => bar.index === barIndex,
          );
          if (splitIndex <= 0) return current;
          const created: PrototypeSection = {
            id: `section-${Date.now()}`,
            name: `Parte ${current.length + 1}`,
            bars: section.bars.slice(splitIndex),
          };
          const next = [...current];
          next.splice(
            index,
            1,
            { ...section, bars: section.bars.slice(0, splitIndex) },
            created,
          );
          setSelectedSectionId(created.id);
          return next;
        });
      },
      mergeWithNext: (sectionId: string) => {
        setSections((current) => {
          const index = current.findIndex(
            (section) => section.id === sectionId,
          );
          const left = current[index];
          const right = current[index + 1];
          if (!left || !right) return current;
          const next = [...current];
          next.splice(index, 2, {
            ...left,
            bars: [...left.bars, ...right.bars],
          });
          setSelectedSectionId(left.id);
          return next;
        });
      },
      shiftBoundary: (boundaryIndex: number, direction: -1 | 1) => {
        setSections((current) => {
          const left = current[boundaryIndex];
          const right = current[boundaryIndex + 1];
          if (!left || !right) return current;
          if (direction === -1 && left.bars.length > 1) {
            const moved = left.bars[left.bars.length - 1];
            return current.map((section, index) => {
              if (index === boundaryIndex) {
                return { ...left, bars: left.bars.slice(0, -1) };
              }
              if (index === boundaryIndex + 1) {
                return { ...right, bars: [moved, ...right.bars] };
              }
              return section;
            });
          }
          if (direction === 1 && right.bars.length > 1) {
            const moved = right.bars[0];
            return current.map((section, index) => {
              if (index === boundaryIndex) {
                return { ...left, bars: [...left.bars, moved] };
              }
              if (index === boundaryIndex + 1) {
                return { ...right, bars: right.bars.slice(1) };
              }
              return section;
            });
          }
          return current;
        });
      },
    }),
    [],
  );

  const selectVariant = (key: VariantKey) => {
    const url = new URL(window.location.href);
    url.searchParams.set('prototype', 'sections');
    url.searchParams.set('variant', key);
    window.history.replaceState({}, '', url);
    setVariant(key);
  };

  const cycleVariant = (offset: number) => {
    const index = VARIANTS.findIndex((item) => item.key === variant);
    const next = (index + offset + VARIANTS.length) % VARIANTS.length;
    selectVariant(VARIANTS[next].key);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches('input, textarea, [contenteditable="true"]') ||
        (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
      ) {
        return;
      }
      event.preventDefault();
      cycleVariant(event.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-button border border-amber-400/35 bg-amber-400/10 px-3 py-2">
        <p className="font-heading text-xs text-amber-300">
          Protótipo descartável · edições somente em memória
        </p>
        <p className="mt-1 text-[11px] text-text-secondary">
          Recorte dos primeiros {bars.slice(0, 20).length} compassos. O objetivo
          é escolher como editar seções cronológicas sem sugerir uma nova ordem
          da música.
        </p>
      </div>

      {variant === 'A' && <VariantA sections={sections} actions={actions} />}
      {variant === 'B' && (
        <VariantB
          sections={sections}
          selectedSectionId={selectedSectionId}
          onSelect={setSelectedSectionId}
          actions={actions}
        />
      )}
      {variant === 'C' && <VariantC sections={sections} actions={actions} />}

      <StateReadout sections={sections} />
      <PrototypeSwitcher
        variant={variant}
        onPrevious={() => cycleVariant(-1)}
        onNext={() => cycleVariant(1)}
      />
    </div>
  );
}

interface VariantProps {
  sections: PrototypeSection[];
  actions: PrototypeActions;
}

interface PrototypeActions {
  rename: (sectionId: string, name: string) => void;
  splitBefore: (sectionId: string, barIndex: number) => void;
  mergeWithNext: (sectionId: string) => void;
  shiftBoundary: (boundaryIndex: number, direction: -1 | 1) => void;
}

function VariantA({ sections, actions }: VariantProps) {
  return (
    <section className="rounded-section border border-border-default bg-bg-section p-3">
      <div className="mb-4">
        <h4 className="font-heading text-sm text-text-primary">
          A · Faixa cronológica
        </h4>
        <p className="text-xs text-text-muted">
          A fronteira é o controle principal; os compassos nunca saem da linha
          do tempo.
        </p>
      </div>
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max items-stretch">
          {sections.map((section, index) => (
            <div key={section.id} className="flex items-stretch">
              <div className="min-w-48 rounded-button border border-border-default bg-bg-card p-2">
                <input
                  aria-label={`Nome da seção ${index + 1}`}
                  value={section.name}
                  onChange={(event) =>
                    actions.rename(section.id, event.target.value)
                  }
                  className="mb-2 w-full rounded-control bg-bg-primary px-2 py-1 font-heading text-xs text-text-primary outline-none focus:ring-2 focus:ring-accent"
                />
                <div className="flex gap-1">
                  {section.bars.map((bar, barIndex) => (
                    <button
                      key={bar.index}
                      type="button"
                      title={
                        barIndex === 0
                          ? 'Primeiro compasso da seção'
                          : 'Dividir antes deste compasso'
                      }
                      onClick={() => actions.splitBefore(section.id, bar.index)}
                      className="cursor-pointer"
                    >
                      <BarChip bar={bar} />
                    </button>
                  ))}
                </div>
              </div>
              {index < sections.length - 1 && (
                <div className="mx-1 flex w-16 flex-col items-center justify-center gap-1 rounded-control border border-dashed border-accent/60 bg-accent/10 px-1">
                  <span className="text-[9px] uppercase text-text-muted">
                    fronteira
                  </span>
                  <div className="flex gap-1">
                    <TinyButton
                      label="Mover fronteira um compasso à esquerda"
                      onClick={() => actions.shiftBoundary(index, -1)}
                    >
                      ←
                    </TinyButton>
                    <TinyButton
                      label="Mover fronteira um compasso à direita"
                      onClick={() => actions.shiftBoundary(index, 1)}
                    >
                      →
                    </TinyButton>
                  </div>
                  <TinyButton
                    label={`Unir ${section.name} à próxima seção`}
                    onClick={() => actions.mergeWithNext(section.id)}
                  >
                    unir
                  </TinyButton>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-text-muted">
        Clique em um compasso para dividir antes dele.
      </p>
    </section>
  );
}

function VariantB({
  sections,
  selectedSectionId,
  onSelect,
  actions,
}: VariantProps & {
  selectedSectionId: string;
  onSelect: (sectionId: string) => void;
}) {
  const selected =
    sections.find((section) => section.id === selectedSectionId) ?? sections[0];
  const index = sections.indexOf(selected);

  return (
    <section className="grid gap-3 rounded-section border border-border-default bg-bg-section p-3 md:grid-cols-[220px_1fr]">
      <div>
        <h4 className="font-heading text-sm text-text-primary">
          B · Seção + inspetor
        </h4>
        <p className="mb-3 text-xs text-text-muted">
          Primeiro escolha a seção; depois execute uma ação explícita.
        </p>
        <div className="flex flex-col gap-1">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelect(section.id)}
              className={`cursor-pointer rounded-button border px-3 py-2 text-left ${
                section.id === selected?.id
                  ? 'border-accent/60 bg-accent/15'
                  : 'border-border-default bg-bg-card'
              }`}
            >
              <span className="block font-heading text-xs text-text-primary">
                {section.name}
              </span>
              <span className="text-[10px] text-text-muted">
                {section.bars.length} compassos · {barRange(section)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="rounded-button border border-border-default bg-bg-card p-3">
          <label className="text-[10px] uppercase tracking-wide text-text-muted">
            Nome da seção
            <input
              value={selected.name}
              onChange={(event) =>
                actions.rename(selected.id, event.target.value)
              }
              className="mt-1 block w-full rounded-control border border-border-default bg-bg-primary px-2 py-1.5 font-heading text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
          <div className="mt-3 grid grid-cols-4 gap-1 sm:grid-cols-8">
            {selected.bars.map((bar, barIndex) => (
              <button
                key={bar.index}
                type="button"
                disabled={barIndex === 0}
                onClick={() => actions.splitBefore(selected.id, bar.index)}
                className="cursor-pointer disabled:cursor-default"
                title={barIndex === 0 ? 'Início atual' : 'Dividir aqui'}
              >
                <BarChip bar={bar} wide />
                <span className="mt-0.5 block text-[9px] text-text-muted">
                  {barIndex === 0 ? 'início' : 'dividir'}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border-default pt-3">
            {index > 0 && (
              <ActionButton onClick={() => actions.shiftBoundary(index - 1, 1)}>
                Receber 1 da anterior
              </ActionButton>
            )}
            {index > 0 && (
              <ActionButton
                onClick={() => actions.shiftBoundary(index - 1, -1)}
              >
                Devolver 1 à anterior
              </ActionButton>
            )}
            {index < sections.length - 1 && (
              <ActionButton onClick={() => actions.mergeWithNext(selected.id)}>
                Unir com a próxima
              </ActionButton>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function VariantC({ sections, actions }: VariantProps) {
  const [boundary, setBoundary] = useState(0);
  const safeBoundary = Math.min(boundary, Math.max(0, sections.length - 2));

  return (
    <section className="rounded-section border border-border-default bg-bg-section p-3">
      <h4 className="font-heading text-sm text-text-primary">
        C · Mesa de fronteiras
      </h4>
      <p className="mb-3 text-xs text-text-muted">
        Uma tabela densa trata cada transição como objeto editável.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-separate border-spacing-y-1 text-left">
          <thead className="text-[10px] uppercase tracking-wide text-text-muted">
            <tr>
              <th className="px-2">Seção cronológica</th>
              <th className="px-2">Intervalo</th>
              <th className="px-2">Compassos</th>
              <th className="px-2">Ação no fim</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((section, index) => (
              <tr key={section.id} className="bg-bg-card align-middle">
                <td className="rounded-l-button px-2 py-2">
                  <input
                    value={section.name}
                    onChange={(event) =>
                      actions.rename(section.id, event.target.value)
                    }
                    className="w-full rounded-control bg-bg-primary px-2 py-1 font-heading text-xs text-text-primary outline-none focus:ring-2 focus:ring-accent"
                  />
                </td>
                <td className="px-2 text-xs text-text-secondary">
                  {barRange(section)}
                </td>
                <td className="px-2">
                  <div className="flex gap-1">
                    {section.bars.map((bar) => (
                      <BarChip key={bar.index} bar={bar} />
                    ))}
                  </div>
                </td>
                <td className="rounded-r-button px-2 py-2">
                  {index < sections.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => setBoundary(index)}
                      className={`cursor-pointer rounded-control border px-2 py-1 text-[10px] ${
                        safeBoundary === index
                          ? 'border-accent bg-accent/15 text-text-primary'
                          : 'border-border-default text-text-secondary'
                      }`}
                    >
                      Editar fronteira
                    </button>
                  ) : (
                    <span className="text-[10px] text-text-muted">
                      Fim da faixa
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sections.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-button border border-accent/35 bg-accent/10 p-2">
          <span className="mr-auto text-xs text-text-secondary">
            {sections[safeBoundary]?.name} | {sections[safeBoundary + 1]?.name}
          </span>
          <ActionButton onClick={() => actions.shiftBoundary(safeBoundary, -1)}>
            Limite ← 1
          </ActionButton>
          <ActionButton onClick={() => actions.shiftBoundary(safeBoundary, 1)}>
            Limite → 1
          </ActionButton>
          <ActionButton
            onClick={() => actions.mergeWithNext(sections[safeBoundary].id)}
          >
            Remover limite e unir
          </ActionButton>
        </div>
      )}
    </section>
  );
}

function PrototypeSwitcher({
  variant,
  onPrevious,
  onNext,
}: {
  variant: VariantKey;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const current = VARIANTS.find((item) => item.key === variant) ?? VARIANTS[0];
  return (
    <div className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/15 bg-slate-950 px-2 py-2 text-white shadow-2xl sm:bottom-5">
      <button
        type="button"
        aria-label="Variante anterior"
        onClick={onPrevious}
        className="h-8 w-8 cursor-pointer rounded-full bg-white/10 hover:bg-white/20"
      >
        ←
      </button>
      <span className="min-w-48 text-center font-mono text-xs">
        {current.key} · {current.name}
      </span>
      <button
        type="button"
        aria-label="Próxima variante"
        onClick={onNext}
        className="h-8 w-8 cursor-pointer rounded-full bg-white/10 hover:bg-white/20"
      >
        →
      </button>
    </div>
  );
}

function StateReadout({ sections }: { sections: PrototypeSection[] }) {
  return (
    <div className="rounded-button border border-border-default bg-bg-primary px-3 py-2">
      <p className="mb-1 text-[10px] uppercase tracking-wide text-text-muted">
        Estado cronológico completo
      </p>
      <code className="block whitespace-normal font-mono text-[11px] text-text-secondary">
        {sections
          .map((section) => `${section.name} [${barRange(section)}]`)
          .join(' → ')}
      </code>
    </div>
  );
}

function BarChip({
  bar,
  wide = false,
}: {
  bar: ChordChartBar;
  wide?: boolean;
}) {
  return (
    <span
      className={`block rounded-control border border-border-default bg-bg-primary px-1.5 py-1 text-center font-heading text-[10px] text-text-primary ${
        wide ? 'w-full' : 'min-w-8'
      }`}
    >
      <span className="block text-[8px] text-text-muted">{bar.index + 1}</span>
      {bar.chords[0]?.chord ?? '—'}
    </span>
  );
}

function TinyButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="cursor-pointer rounded-control border border-border-default bg-bg-card px-1.5 py-1 text-[9px] text-text-secondary hover:bg-bg-hover"
    >
      {children}
    </button>
  );
}

function ActionButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-button border border-border-default bg-bg-primary px-2.5 py-1.5 text-[11px] text-text-secondary hover:border-accent/50 hover:text-text-primary"
    >
      {children}
    </button>
  );
}

function createInitialSections(bars: ChordChartBar[]): PrototypeSection[] {
  if (bars.length === 0) return [];
  const cutA = Math.max(1, Math.min(4, Math.floor(bars.length / 3)));
  const cutB = Math.max(
    cutA + 1,
    Math.min(12, Math.floor((bars.length * 2) / 3)),
  );
  const slices = [
    bars.slice(0, cutA),
    bars.slice(cutA, cutB),
    bars.slice(cutB),
  ].filter((slice) => slice.length > 0);
  return slices.map((slice, index) => ({
    id: `initial-${index}`,
    name: `Parte ${index + 1}`,
    bars: slice,
  }));
}

function barRange(section: PrototypeSection): string {
  const first = section.bars[0]?.index;
  const last = section.bars[section.bars.length - 1]?.index;
  if (first === undefined || last === undefined) return 'vazia';
  return first === last ? `${first + 1}` : `${first + 1}–${last + 1}`;
}

function readVariant(): VariantKey {
  const value = new URLSearchParams(window.location.search).get('variant');
  return value === 'B' || value === 'C' ? value : 'A';
}
