import { useEffect, useMemo, useState } from 'react';
import { SECTION_COLORS, SECTION_LABELS } from '@/constants/songSections';
import type { HarmonicFunction } from '@/constants/harmonicFields';
import type { ProgressionStep } from '@/constants/progressions';
import { useAppStore } from '@/store/useAppStore';
import { resolveStep } from '@/domain/stepResolution';
import { FUNCTION_COLORS } from '@/constants/functionColors';

interface SelectedStep {
  sectionIndex: number;
  stepIndex: number;
}

interface StepDetails {
  chordName: string;
  noteNames: string[];
  harmonicFunction: HarmonicFunction | null;
}

const SECTION_TYPES = [
  'intro',
  'verso',
  'pre-refrao',
  'refrao',
  'ponte',
  'solo',
  'outro',
  'custom',
] as const;

function getStepDetails(
  step: ProgressionStep,
  harmonicField: ReturnType<typeof useAppStore.getState>['harmonicField'],
  rootNote: number,
): StepDetails {
  const resolved = resolveStep(step, harmonicField, rootNote);
  return {
    chordName: resolved.chordName,
    noteNames: resolved.noteNames,
    harmonicFunction: resolved.harmonicFunction,
  };
}

function ReviewChordCard({
  step,
  selected,
  details,
  onSelect,
}: {
  step: ProgressionStep;
  selected: boolean;
  details: StepDetails;
  onSelect: () => void;
}) {
  const isUnsure = step.confidence === 'unsure';
  const borderColor = details.harmonicFunction
    ? FUNCTION_COLORS[details.harmonicFunction]
    : 'var(--color-accent)';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`min-w-0 rounded-card border p-3 text-left transition-all ${
        selected
          ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg-primary'
          : ''
      } ${
        isUnsure
          ? 'border-amber-300/70 bg-amber-300/10'
          : 'border-border-default bg-bg-card hover:border-accent/50'
      }`}
      style={{ borderLeftColor: isUnsure ? undefined : borderColor }}
      aria-pressed={selected}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-[9px] uppercase tracking-[0.12em] ${
            isUnsure ? 'text-amber-200' : 'text-text-muted'
          }`}
        >
          {isUnsure ? 'Revisar' : 'Confirmado'}
        </span>
        <span className="text-[10px] text-text-muted">{step.beats ?? 4}t</span>
      </div>
      <p
        className={`mt-2 truncate font-heading text-base ${
          isUnsure ? 'text-amber-200' : 'text-text-primary'
        }`}
      >
        {step.label}
      </p>
      <p className="mt-1 truncate text-[10px] text-text-secondary">
        {details.chordName}
      </p>
    </button>
  );
}

function EmptyReviewState() {
  return (
    <div className="rounded-section border border-dashed border-border-default p-10 text-center">
      <p className="font-heading text-lg text-text-primary">
        A transcrição aparecerá aqui
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-muted">
        Importe um arquivo Guitar Pro ou adicione uma seção para começar a
        revisar os acordes.
      </p>
      <AddSectionControl className="mt-5" />
    </div>
  );
}

function AddSectionControl({ className = '' }: { className?: string }) {
  const addSection = useAppStore((state) => state.addSection);

  return (
    <label className={`inline-flex items-center gap-2 ${className}`}>
      <span className="text-xs text-text-muted">Adicionar seção</span>
      <select
        value=""
        onChange={(event) => {
          if (event.target.value) {
            addSection(event.target.value as (typeof SECTION_TYPES)[number]);
          }
        }}
        className="rounded-button border border-border-default bg-bg-tertiary px-3 py-2 text-xs text-text-secondary focus:border-accent focus:outline-none"
        aria-label="Adicionar seção"
      >
        <option value="">Escolher</option>
        {SECTION_TYPES.map((type) => (
          <option key={type} value={type}>
            {SECTION_LABELS[type]}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function TranscriptionReviewWorkspace() {
  const songSections = useAppStore((state) => state.songSections);
  const activeSectionIndex = useAppStore((state) => state.activeSectionIndex);
  const setActiveSectionIndex = useAppStore(
    (state) => state.setActiveSectionIndex,
  );
  const harmonicField = useAppStore((state) => state.harmonicField);
  const rootNote = useAppStore((state) => state.rootNote);
  const setSongStepBeats = useAppStore((state) => state.setSongStepBeats);
  const setSongStepConfidence = useAppStore(
    (state) => state.setSongStepConfidence,
  );
  const removeSongStep = useAppStore((state) => state.removeSongStep);

  const [selectedStep, setSelectedStep] = useState<SelectedStep | null>(null);

  const allSteps = useMemo(
    () =>
      songSections.flatMap((section, sectionIndex) =>
        section.steps.map((step, stepIndex) => ({
          sectionIndex,
          stepIndex,
          step,
        })),
      ),
    [songSections],
  );

  const reviewCount = allSteps.filter(
    ({ step }) => step.confidence === 'unsure',
  ).length;
  const confirmedCount = allSteps.length - reviewCount;
  const reviewDescription =
    reviewCount === 0
      ? 'Tudo revisado'
      : `${reviewCount} de ${allSteps.length} acordes precisam da sua decisão.`;
  const confirmedDescription =
    confirmedCount === 1 ? '1 confirmado' : `${confirmedCount} confirmados`;

  useEffect(() => {
    if (allSteps.length === 0) {
      setSelectedStep(null);
      return;
    }

    const selectedStillExists = selectedStep
      ? allSteps.some(
          (item) =>
            item.sectionIndex === selectedStep.sectionIndex &&
            item.stepIndex === selectedStep.stepIndex,
        )
      : false;

    if (!selectedStillExists) {
      const firstReview = allSteps.find(
        ({ step }) => step.confidence === 'unsure',
      );
      setSelectedStep(firstReview ?? allSteps[0]);
    }
  }, [allSteps, selectedStep]);

  const selectedItem = selectedStep
    ? allSteps.find(
        (item) =>
          item.sectionIndex === selectedStep.sectionIndex &&
          item.stepIndex === selectedStep.stepIndex,
      )
    : undefined;
  const selectedDetails = selectedItem
    ? getStepDetails(selectedItem.step, harmonicField, rootNote)
    : null;

  const selectStep = (sectionIndex: number, stepIndex: number) => {
    setActiveSectionIndex(sectionIndex);
    setSelectedStep({ sectionIndex, stepIndex });
  };

  const moveSelection = (direction: -1 | 1) => {
    if (!selectedItem) return;
    const currentIndex = allSteps.findIndex(
      (item) =>
        item.sectionIndex === selectedItem.sectionIndex &&
        item.stepIndex === selectedItem.stepIndex,
    );
    const next = allSteps[currentIndex + direction];
    if (next) selectStep(next.sectionIndex, next.stepIndex);
  };

  const toggleConfidence = () => {
    if (!selectedItem) return;
    setSongStepConfidence(
      selectedItem.sectionIndex,
      selectedItem.stepIndex,
      selectedItem.step.confidence === 'unsure' ? 'sure' : 'unsure',
    );
  };

  if (songSections.length === 0 || allSteps.length === 0) {
    return <EmptyReviewState />;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <main className="min-w-0 rounded-section border border-border-default bg-bg-tertiary/20 p-4 sm:p-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-accent">
              Revisão focada
            </p>
            <h3 className="mt-2 font-heading text-2xl text-text-primary">
              Revise os pontos incertos
            </h3>
            <p className="mt-1 text-sm text-text-secondary">
              {reviewDescription}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-text-muted">
              {confirmedDescription}
            </span>
            <AddSectionControl />
          </div>
        </header>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-card border border-amber-300/20 bg-amber-300/5 px-3 py-3">
          <div>
            <p className="text-xs font-medium text-amber-100">
              Selecione um acorde para conferir os detalhes
            </p>
            <p className="mt-1 text-[10px] text-amber-100/60">
              Os acordes em amarelo ainda precisam de revisão.
            </p>
          </div>
          <span className="text-xs text-amber-200">
            {reviewCount > 0 ? `${reviewCount} para revisar` : 'Tudo revisado'}
          </span>
        </div>

        <div className="mt-5 space-y-5">
          {songSections.map((section, sectionIndex) => {
            const label = section.customLabel || SECTION_LABELS[section.type];
            const isActive = sectionIndex === activeSectionIndex;

            return (
              <section key={section.id}>
                <button
                  type="button"
                  onClick={() => setActiveSectionIndex(sectionIndex)}
                  className={`mb-2 flex items-center gap-2 text-left ${
                    isActive ? 'text-text-primary' : 'text-text-secondary'
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: SECTION_COLORS[section.type] }}
                  />
                  <span className="text-xs font-medium">{label}</span>
                  <span className="text-[10px] text-text-muted">
                    {section.steps.length} acordes
                  </span>
                </button>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {section.steps.map((step, stepIndex) => (
                    <ReviewChordCard
                      key={`${section.id}-${stepIndex}`}
                      step={step}
                      selected={
                        selectedStep?.sectionIndex === sectionIndex &&
                        selectedStep.stepIndex === stepIndex
                      }
                      details={getStepDetails(step, harmonicField, rootNote)}
                      onSelect={() => selectStep(sectionIndex, stepIndex)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </main>

      <aside className="flex h-fit flex-col rounded-section border border-border-default bg-bg-card p-5 xl:sticky xl:top-4">
        {selectedItem && selectedDetails ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-amber-200">
                  Acorde selecionado
                </p>
                <h3
                  className={`mt-2 font-heading text-4xl ${
                    selectedItem.step.confidence === 'unsure'
                      ? 'text-amber-200'
                      : 'text-accent'
                  }`}
                >
                  {selectedItem.step.label}
                </h3>
                <p className="mt-1 text-sm text-text-secondary">
                  {selectedDetails.chordName} ·{' '}
                  {SECTION_LABELS[
                    songSections[selectedItem.sectionIndex].type
                  ] ?? 'Seção'}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-[10px] ${
                  selectedItem.step.confidence === 'unsure'
                    ? 'bg-amber-300/10 text-amber-200'
                    : 'bg-emerald-400/10 text-emerald-300'
                }`}
              >
                {selectedItem.step.confidence === 'unsure'
                  ? 'Incerto'
                  : 'Confirmado'}
              </span>
            </div>

            <div className="mt-6 space-y-4 border-y border-border-default py-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
                  Notas detectadas
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedDetails.noteNames.length > 0 ? (
                    selectedDetails.noteNames.map((note) => (
                      <span
                        key={note}
                        className="rounded-md bg-bg-tertiary px-2.5 py-1.5 font-mono text-xs text-text-primary"
                      >
                        {note}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-text-muted">
                      Nenhuma nota detalhada
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-secondary">Duração</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSongStepBeats(
                        selectedItem.sectionIndex,
                        selectedItem.stepIndex,
                        (selectedItem.step.beats ?? 4) - 0.5,
                      )
                    }
                    className="h-7 w-7 rounded bg-bg-tertiary text-text-secondary"
                    aria-label="Diminuir duração"
                  >
                    −
                  </button>
                  <span className="min-w-[48px] text-center font-mono text-text-primary">
                    {selectedItem.step.beats ?? 4}t
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSongStepBeats(
                        selectedItem.sectionIndex,
                        selectedItem.stepIndex,
                        (selectedItem.step.beats ?? 4) + 0.5,
                      )
                    }
                    className="h-7 w-7 rounded bg-bg-tertiary text-text-secondary"
                    aria-label="Aumentar duração"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-text-muted">
              Confira as notas detectadas e marque o acorde como correto quando
              estiver satisfeito.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={toggleConfidence}
                className="rounded-button border border-border-default px-3 py-2.5 text-xs text-text-secondary"
              >
                {selectedItem.step.confidence === 'unsure'
                  ? 'Manter incerto'
                  : 'Marcar incerto'}
              </button>
              <button
                type="button"
                onClick={toggleConfidence}
                className="rounded-button bg-accent px-3 py-2.5 text-xs font-semibold text-white"
              >
                {selectedItem.step.confidence === 'unsure'
                  ? 'Confirmar'
                  : 'Confirmado'}
              </button>
            </div>
            <button
              type="button"
              onClick={() =>
                removeSongStep(
                  selectedItem.sectionIndex,
                  selectedItem.stepIndex,
                )
              }
              className="mt-3 text-xs text-red-300/80 hover:text-red-300"
            >
              Remover acorde
            </button>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => moveSelection(-1)}
                disabled={!allSteps[allSteps.indexOf(selectedItem) - 1]}
                className="flex-1 rounded-button border border-border-default px-3 py-2 text-xs text-text-muted disabled:opacity-30"
              >
                ← Anterior
              </button>
              <button
                type="button"
                onClick={() => moveSelection(1)}
                disabled={!allSteps[allSteps.indexOf(selectedItem) + 1]}
                className="flex-1 rounded-button border border-border-default px-3 py-2 text-xs text-text-muted disabled:opacity-30"
              >
                Próximo →
              </button>
            </div>
          </>
        ) : (
          <div className="py-8 text-center">
            <p className="text-sm text-text-secondary">
              Selecione um acorde para revisar
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
