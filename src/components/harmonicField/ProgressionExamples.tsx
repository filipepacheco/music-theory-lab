import { useState } from 'react';
import { PROGRESSION_EXAMPLES } from '@/constants/progressions';
import { PRESET_MAP } from '@/constants/tonePresets';
import { useStepPlayer } from '@/hooks/useStepPlayer';

export default function ProgressionExamples() {
  const [currentStep, setCurrentStep] = useState(-1);

  const { play, stop, currentId } = useStepPlayer({
    id: '',
    steps: [],
    mode: 'major',
    presetId: 'piano',
    bpm: 90,
    applyGlobals: true,
    onStepChange: setCurrentStep,
  });

  return (
    <div>
      <h3 className="font-heading text-sm text-text-secondary mb-3">
        Progressões de Exemplo
      </h3>
      {/* Mobile: horizontal scroll / Desktop: grid */}
      <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-3 sm:overflow-visible sm:pb-0">
        {PROGRESSION_EXAMPLES.map((prog) => {
          const isPlaying = currentId === prog.id;
          const preset = PRESET_MAP[prog.presetId];
          return (
            <button
              key={prog.id}
              aria-pressed={isPlaying}
              onClick={() =>
                isPlaying
                  ? stop()
                  : play({
                      id: prog.id,
                      steps: prog.steps,
                      mode: prog.mode,
                      presetId: prog.presetId,
                      bpm: prog.bpm,
                    })
              }
              className={`text-left p-3 sm:p-5 border cursor-pointer min-w-40 sm:min-w-0 shrink-0 sm:shrink active:translate-x-px active:translate-y-px ${
                isPlaying
                  ? 'border-dashed border-live bg-live-tint'
                  : 'border-border-default bg-bg-card hover:border-accent hover:shadow-lift'
              }`}
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-2 sm:gap-2">
                <span className="font-heading text-sm text-text-primary truncate min-w-0">
                  {prog.name}
                </span>
                <span className="lh-meta-text shrink-0">
                  {preset && `${preset.name} · `}
                  {prog.bpm} bpm · {prog.mode === 'minor' ? 'menor' : 'maior'}
                </span>
              </div>

              <div className="flex gap-1 mb-2 sm:mb-3 flex-wrap">
                {prog.steps.map((step, i) => (
                  <span
                    key={i}
                    className={`text-xs px-1.5 py-0.5 border ${
                      isPlaying && currentStep === i
                        ? 'border-live bg-live text-on-accent'
                        : step.degree === null
                          ? 'border-border-strong bg-bg-tertiary text-text-primary'
                          : 'border-transparent bg-bg-tertiary text-text-secondary'
                    }`}
                    style={
                      step.beats && step.beats > 4
                        ? { flexGrow: step.beats / 4 }
                        : undefined
                    }
                  >
                    {step.label}
                    {step.beats && step.beats > 4 && (
                      <span className="text-micro opacity-50 ml-0.5">
                        {step.beats / 4}c
                      </span>
                    )}
                  </span>
                ))}
              </div>

              <p
                className="text-xs text-text-muted leading-relaxed overflow-hidden"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {prog.description}
              </p>

              {isPlaying && (
                <div className="mt-2 text-meta text-live">
                  Tocando... (clique para parar)
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
