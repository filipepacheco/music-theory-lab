// THROWAWAY PROTOTYPE: three treatments for rejected section-boundary
// candidates, switchable with ?prototype=rejected-boundaries&variant=A|B|C.
import { useEffect, useMemo, useState } from 'react';
import type { ChordChartBar } from './libraryData';

interface Props {
  bars: ChordChartBar[];
}

type VariantKey = 'A' | 'B' | 'C';

interface Candidate {
  id: string;
  beforeBar: number;
  support: number;
  reason: string;
}

const VARIANTS: { key: VariantKey; name: string }[] = [
  { key: 'A', name: 'Fantasmas na faixa' },
  { key: 'B', name: 'Diagnóstico separado' },
  { key: 'C', name: 'Somente edição manual' },
];

const CANDIDATES: Candidate[] = [
  {
    id: 'candidate-1',
    beforeBar: 4,
    support: 61,
    reason: 'apoio abaixo do mínimo de 67%',
  },
  {
    id: 'candidate-2',
    beforeBar: 11,
    support: 54,
    reason: 'instável nas perturbações de áudio',
  },
  {
    id: 'candidate-3',
    beforeBar: 16,
    support: 48,
    reason: 'contagem de seções não concordou',
  },
];

export default function RejectedBoundarySuggestionsPrototype({ bars }: Props) {
  const visibleBars = useMemo(() => bars.slice(0, 20), [bars]);
  const [variant, setVariant] = useState<VariantKey>(readVariant);
  const [showCandidates, setShowCandidates] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [previewCandidateId, setPreviewCandidateId] = useState<string | null>(
    null,
  );
  const [acceptedBoundaries, setAcceptedBoundaries] = useState<number[]>([]);
  const [lastChange, setLastChange] = useState(
    'A análise recuou para uma seção única porque nenhuma divisão foi confiável.',
  );

  const selectVariant = (key: VariantKey) => {
    const url = new URL(window.location.href);
    url.searchParams.set('prototype', 'rejected-boundaries');
    url.searchParams.set('variant', key);
    window.history.replaceState({}, '', url);
    setVariant(key);
    setShowCandidates(false);
    setDrawerOpen(false);
    setPreviewCandidateId(null);
    setAcceptedBoundaries([]);
    setLastChange('Variante reiniciada com uma seção única editável.');
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

  const createBoundary = (
    beforeBar: number,
    source: 'candidate' | 'manual',
  ) => {
    setAcceptedBoundaries((current) =>
      [...new Set([...current, beforeBar])].sort((a, b) => a - b),
    );
    setLastChange(
      source === 'candidate'
        ? `Você transformou a sugestão antes do compasso ${beforeBar + 1} em uma divisão manual.`
        : `Você criou manualmente uma divisão antes do compasso ${beforeBar + 1}.`,
    );
  };

  const previewCandidate = CANDIDATES.find(
    (candidate) => candidate.id === previewCandidateId,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-button border border-amber-400/35 bg-amber-400/10 px-3 py-2">
        <p className="font-heading text-xs text-amber-300">
          Protótipo descartável · nenhuma alteração é salva
        </p>
        <p className="mt-1 text-[11px] text-text-secondary">
          A pergunta: quando a análise rejeita todas as divisões, devemos
          revelar seus candidatos — e como deixar inequívoco que não são
          confiáveis?
        </p>
      </div>

      {variant === 'A' && (
        <VariantA
          bars={visibleBars}
          showCandidates={showCandidates}
          acceptedBoundaries={acceptedBoundaries}
          onToggle={() => {
            setShowCandidates((current) => !current);
            setLastChange(
              showCandidates
                ? 'As sugestões rejeitadas foram ocultadas.'
                : 'Três sugestões rejeitadas foram reveladas na faixa.',
            );
          }}
          onCreate={(beforeBar) => createBoundary(beforeBar, 'candidate')}
        />
      )}

      {variant === 'B' && (
        <VariantB
          bars={visibleBars}
          drawerOpen={drawerOpen}
          previewCandidate={previewCandidate}
          acceptedBoundaries={acceptedBoundaries}
          onToggleDrawer={() => {
            setDrawerOpen((current) => !current);
            setPreviewCandidateId(null);
            setLastChange(
              drawerOpen
                ? 'O diagnóstico rejeitado foi fechado.'
                : 'O diagnóstico rejeitado foi aberto fora da faixa.',
            );
          }}
          onPreview={(id) => {
            setPreviewCandidateId(id);
            const candidate = CANDIDATES.find((item) => item.id === id);
            if (candidate) {
              setLastChange(
                `Prévia temporária antes do compasso ${candidate.beforeBar + 1}; nenhuma divisão foi criada.`,
              );
            }
          }}
          onCreate={(beforeBar) => createBoundary(beforeBar, 'candidate')}
        />
      )}

      {variant === 'C' && (
        <VariantC
          bars={visibleBars}
          acceptedBoundaries={acceptedBoundaries}
          onCreate={(beforeBar) => createBoundary(beforeBar, 'manual')}
        />
      )}

      <StateReadout
        variant={variant}
        showCandidates={showCandidates}
        drawerOpen={drawerOpen}
        previewCandidate={previewCandidate}
        acceptedBoundaries={acceptedBoundaries}
        lastChange={lastChange}
      />

      <PrototypeSwitcher
        variant={variant}
        onPrevious={() => cycleVariant(-1)}
        onNext={() => cycleVariant(1)}
      />
    </div>
  );
}

function VariantA({
  bars,
  showCandidates,
  acceptedBoundaries,
  onToggle,
  onCreate,
}: {
  bars: ChordChartBar[];
  showCandidates: boolean;
  acceptedBoundaries: number[];
  onToggle: () => void;
  onCreate: (beforeBar: number) => void;
}) {
  return (
    <section className="rounded-section border border-border-default bg-bg-section p-3">
      <FallbackHeader
        title="A · Fantasmas na faixa"
        description="A faixa começa limpa; um comando explícito revela candidatos fracos no próprio contexto."
        action={
          <button
            type="button"
            onClick={onToggle}
            className="cursor-pointer rounded-button border border-border-default bg-bg-primary px-3 py-1.5 text-[11px] text-text-secondary hover:border-amber-300/50"
          >
            {showCandidates
              ? 'Ocultar sugestões rejeitadas'
              : 'Ver 3 sugestões rejeitadas'}
          </button>
        }
      />
      {showCandidates && (
        <div className="mb-3 rounded-button border border-amber-300/25 bg-amber-400/5 px-3 py-2 text-[11px] text-amber-200/80">
          Estas divisões falharam no teste de estabilidade. Elas são pistas para
          revisão, não resultados da análise.
        </div>
      )}
      <ChronologicalStrip
        bars={bars}
        acceptedBoundaries={acceptedBoundaries}
        inlineCandidates={showCandidates ? CANDIDATES : []}
        onCreate={onCreate}
      />
    </section>
  );
}

function VariantB({
  bars,
  drawerOpen,
  previewCandidate,
  acceptedBoundaries,
  onToggleDrawer,
  onPreview,
  onCreate,
}: {
  bars: ChordChartBar[];
  drawerOpen: boolean;
  previewCandidate?: Candidate;
  acceptedBoundaries: number[];
  onToggleDrawer: () => void;
  onPreview: (id: string) => void;
  onCreate: (beforeBar: number) => void;
}) {
  return (
    <section
      className={`grid gap-3 rounded-section border border-border-default bg-bg-section p-3 ${
        drawerOpen ? 'lg:grid-cols-[minmax(0,1fr)_280px]' : ''
      }`}
    >
      <div className="min-w-0">
        <FallbackHeader
          title="B · Diagnóstico separado"
          description="A faixa nunca exibe rejeições por padrão; o histórico técnico abre numa área secundária."
          action={
            <button
              type="button"
              onClick={onToggleDrawer}
              className="cursor-pointer rounded-button border border-border-default bg-bg-primary px-3 py-1.5 text-[11px] text-text-secondary hover:border-accent/50"
            >
              {drawerOpen
                ? 'Fechar diagnóstico'
                : 'Abrir diagnóstico da análise'}
            </button>
          }
        />
        <ChronologicalStrip
          bars={bars}
          acceptedBoundaries={acceptedBoundaries}
          previewBeforeBar={previewCandidate?.beforeBar}
        />
      </div>
      {drawerOpen && (
        <aside className="rounded-button border border-border-default bg-bg-primary p-3">
          <p className="font-heading text-xs text-text-primary">
            Resultado rejeitado
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-text-muted">
            Nenhuma candidata atingiu o mínimo para publicação. Pré-visualizar
            não altera a seção.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {CANDIDATES.map((candidate) => (
              <div
                key={candidate.id}
                className="rounded-control border border-border-default bg-bg-card p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-heading text-[11px] text-text-secondary">
                    Antes do compasso {candidate.beforeBar + 1}
                  </span>
                  <span className="rounded-full bg-red-400/10 px-1.5 py-0.5 text-[9px] text-red-300">
                    rejeitada
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-text-muted">
                  {candidate.support}% de apoio · {candidate.reason}
                </p>
                <div className="mt-2 flex gap-1">
                  <SmallButton onClick={() => onPreview(candidate.id)}>
                    Pré-visualizar
                  </SmallButton>
                  {previewCandidate?.id === candidate.id && (
                    <SmallButton onClick={() => onCreate(candidate.beforeBar)}>
                      Usar como divisão manual
                    </SmallButton>
                  )}
                </div>
              </div>
            ))}
          </div>
        </aside>
      )}
    </section>
  );
}

function VariantC({
  bars,
  acceptedBoundaries,
  onCreate,
}: {
  bars: ChordChartBar[];
  acceptedBoundaries: number[];
  onCreate: (beforeBar: number) => void;
}) {
  return (
    <section className="rounded-section border border-border-default bg-bg-section p-3">
      <FallbackHeader
        title="C · Somente edição manual"
        description="Candidatos rejeitados ficam apenas na proveniência técnica; a pessoa começa sem âncoras algorítmicas."
      />
      <div className="mb-3 rounded-button border border-accent/20 bg-accent/5 px-3 py-2">
        <p className="text-xs text-text-secondary">
          A música está inteira em “Parte 1”. Clique num compasso para iniciar
          uma nova seção ali.
        </p>
        <p className="mt-1 text-[10px] text-text-muted">
          A análise automática não encontrou divisões confiáveis. O resultado
          rejeitado continua disponível somente no histórico da análise.
        </p>
      </div>
      <ChronologicalStrip
        bars={bars}
        acceptedBoundaries={acceptedBoundaries}
        manualMode
        onCreate={onCreate}
      />
    </section>
  );
}

function FallbackHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h4 className="font-heading text-sm text-text-primary">{title}</h4>
        <p className="mt-1 max-w-2xl text-xs text-text-muted">{description}</p>
      </div>
      {action}
    </header>
  );
}

function ChronologicalStrip({
  bars,
  acceptedBoundaries,
  inlineCandidates = [],
  previewBeforeBar,
  manualMode = false,
  onCreate,
}: {
  bars: ChordChartBar[];
  acceptedBoundaries: number[];
  inlineCandidates?: Candidate[];
  previewBeforeBar?: number;
  manualMode?: boolean;
  onCreate?: (beforeBar: number) => void;
}) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="min-w-[760px] rounded-button border border-border-default bg-bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-heading text-xs text-text-primary">
            Parte 1 · música completa
          </span>
          <span className="text-[10px] text-text-muted">
            ordem original preservada
          </span>
        </div>
        <div className="grid grid-cols-[repeat(20,minmax(0,1fr))] gap-1">
          {bars.map((bar, index) => {
            const candidate = inlineCandidates.find(
              (item) => item.beforeBar === index,
            );
            const accepted = acceptedBoundaries.includes(index);
            const previewed = previewBeforeBar === index;
            return (
              <div key={bar.index} className="relative min-w-0">
                {(candidate || accepted || previewed) && index > 0 && (
                  <div
                    className={`absolute -left-[3px] -top-2 bottom-0 z-10 border-l-2 ${
                      accepted
                        ? 'border-accent'
                        : previewed
                          ? 'border-dashed border-sky-300'
                          : 'border-dashed border-amber-300/70'
                    }`}
                  />
                )}
                {candidate && !accepted && (
                  <button
                    type="button"
                    title={`${candidate.support}% de apoio · ${candidate.reason}`}
                    onClick={() => onCreate?.(candidate.beforeBar)}
                    className="absolute -top-7 left-0 z-20 -translate-x-1/2 cursor-pointer whitespace-nowrap rounded-full border border-amber-300/30 bg-bg-primary px-1.5 py-0.5 text-[8px] text-amber-200/70"
                  >
                    rejeitada {candidate.support}%
                  </button>
                )}
                <button
                  type="button"
                  disabled={!manualMode || index === 0}
                  title={
                    manualMode && index > 0
                      ? `Dividir antes do compasso ${bar.index + 1}`
                      : undefined
                  }
                  onClick={() => onCreate?.(index)}
                  className={`w-full rounded-control border px-1 py-2 text-center ${
                    manualMode && index > 0
                      ? 'cursor-pointer border-border-default bg-bg-primary hover:border-accent/60'
                      : 'border-border-default bg-bg-primary'
                  }`}
                >
                  <span className="block text-[8px] text-text-muted">
                    {bar.index + 1}
                  </span>
                  <span className="block truncate font-heading text-[10px] text-text-primary">
                    {bar.chords[0]?.chord ?? '—'}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SmallButton({
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
      className="cursor-pointer rounded-control border border-border-default bg-bg-primary px-2 py-1 text-[9px] text-text-secondary hover:border-accent/50"
    >
      {children}
    </button>
  );
}

function StateReadout({
  variant,
  showCandidates,
  drawerOpen,
  previewCandidate,
  acceptedBoundaries,
  lastChange,
}: {
  variant: VariantKey;
  showCandidates: boolean;
  drawerOpen: boolean;
  previewCandidate?: Candidate;
  acceptedBoundaries: number[];
  lastChange: string;
}) {
  return (
    <div className="rounded-button border border-border-default bg-bg-primary px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-text-muted">
        Estado completo do protótipo
      </p>
      <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-4">
        <State label="Publicação" value="1 seção fallback" />
        <State
          label="Rejeições visíveis"
          value={showCandidates || drawerOpen ? 'sim, por escolha' : 'não'}
        />
        <State
          label="Prévia"
          value={
            previewCandidate
              ? `antes do compasso ${previewCandidate.beforeBar + 1}`
              : 'nenhuma'
          }
        />
        <State
          label="Divisões manuais"
          value={
            acceptedBoundaries.length
              ? acceptedBoundaries.map((bar) => bar + 1).join(', ')
              : 'nenhuma'
          }
        />
      </div>
      <p className="mt-2 text-[11px] text-text-secondary">
        <span className="font-heading">{variant}:</span> {lastChange}
      </p>
    </div>
  );
}

function State({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control bg-bg-card px-2 py-1.5">
      <span className="block text-[9px] uppercase text-text-muted">
        {label}
      </span>
      <strong className="font-heading text-[11px] text-text-primary">
        {value}
      </strong>
    </div>
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
      <span className="min-w-52 text-center font-mono text-xs">
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

function readVariant(): VariantKey {
  const value = new URLSearchParams(window.location.search).get('variant');
  return value === 'B' || value === 'C' ? value : 'A';
}
