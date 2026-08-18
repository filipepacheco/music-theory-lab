import { useState } from 'react';
import { motion } from 'framer-motion';
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
            <motion.button
              key={prog.id}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
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
              className={`text-left p-3 sm:p-5 rounded-[10px] sm:rounded-card border transition-all cursor-pointer min-w-40 sm:min-w-0 shrink-0 sm:shrink ${
                isPlaying
                  ? 'border-accent bg-accent/10'
                  : 'bg-bg-card hover:border-border-focus'
              }`}
              style={{
                boxShadow: isPlaying
                  ? '0 0 16px var(--color-tonic-glow)'
                  : 'var(--shadow-card)',
                borderColor: isPlaying ? undefined : 'rgba(255,255,255,0.1)',
              }}
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-2 sm:gap-2">
                <span className="font-heading text-sm text-text-primary truncate min-w-0">
                  {prog.name}
                </span>
                <div className="flex gap-1 shrink-0">
                  {preset && (
                    <span className="text-[10px] font-mono text-accent px-1.5 py-0.5 rounded bg-accent/10">
                      {preset.name}
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-text-muted px-1.5 py-0.5 rounded bg-bg-tertiary">
                    {prog.bpm} bpm
                  </span>
                  <span className="text-[10px] font-mono text-text-muted px-1.5 py-0.5 rounded bg-bg-tertiary">
                    {prog.mode === 'minor' ? 'menor' : 'maior'}
                  </span>
                </div>
              </div>

              <div className="flex gap-1 mb-2 sm:mb-3 flex-wrap">
                {prog.steps.map((step, i) => (
                  <span
                    key={i}
                    className={`text-xs font-mono px-1.5 py-0.5 rounded transition-colors ${
                      isPlaying && currentStep === i
                        ? 'bg-accent text-white'
                        : step.degree === null
                          ? 'bg-accent/20 text-accent'
                          : 'bg-bg-tertiary text-text-secondary'
                    }`}
                    style={
                      step.beats && step.beats > 4
                        ? { flexGrow: step.beats / 4 }
                        : undefined
                    }
                  >
                    {step.label}
                    {step.beats && step.beats > 4 && (
                      <span className="text-[9px] opacity-50 ml-0.5">
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
                <div className="mt-2 text-[10px] text-accent font-medium">
                  Tocando... (clique para parar)
                </div>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
