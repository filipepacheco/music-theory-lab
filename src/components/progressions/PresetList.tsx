import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';
import { useSavedProgressions } from '@/hooks/useSavedProgressions';
import SaveProgressionDialog from '@/components/progressions/SaveProgressionDialog';

export default function PresetList() {
  const loadProgressionPreset = useAppStore((s) => s.loadProgressionPreset);
  const setBpm = useAppStore((s) => s.setBpm);
  const setActivePresetId = useAppStore((s) => s.setActivePresetId);
  const isMinor = useAppStore((s) => s.isMinor);
  const customProgression = useAppStore((s) => s.customProgression);
  const activePresetId = useAppStore((s) => s.activePresetId);
  const bpm = useAppStore((s) => s.bpm);

  const mode = isMinor ? 'minor' : 'major';
  const { progressions, isLoading, save, remove } =
    useSavedProgressions(mode);

  const [showSave, setShowSave] = useState(false);

  const examples = progressions.filter((p) => p.isExample);
  const userSaved = progressions.filter((p) => !p.isExample);

  const loadProgression = (prog: (typeof progressions)[number]) => {
    loadProgressionPreset(prog.steps);
    setBpm(prog.bpm);
    setActivePresetId(prog.presetId);
  };

  if (isLoading) {
    return (
      <div className="text-xs text-text-muted py-2">
        Carregando progressoes...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Save button */}
      {customProgression.length > 0 && (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowSave(true)}
          className="flex items-center justify-center gap-1.5 text-sm font-medium px-6 py-2.5 rounded-lg border border-accent/40 text-accent hover:bg-accent/10 transition-colors cursor-pointer w-full sm:w-auto"
        >
          <span>+</span>
          <span>Salvar progressao</span>
        </motion.button>
      )}

      <SaveProgressionDialog
        open={showSave}
        steps={customProgression}
        mode={mode}
        presetId={activePresetId}
        bpm={bpm}
        onSave={save}
        onClose={() => setShowSave(false)}
      />

      {/* User saved progressions */}
      {userSaved.length > 0 && (
        <div>
          <h3 className="font-heading text-sm text-text-secondary mb-2">
            Suas progressoes
          </h3>
          <div className="flex flex-col sm:flex-row gap-2 sm:flex-wrap">
            {userSaved.map((prog) => (
              <motion.button
                key={prog.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => loadProgression(prog)}
                className="group relative text-left px-4 py-3 rounded-lg border border-border-default bg-bg-card hover:border-accent/50 hover:shadow-[var(--shadow-card-hover)] transition-all cursor-pointer"
              >
                <span className="font-heading text-xs text-text-primary block pr-6 group-hover:text-accent transition-colors">
                  {prog.name}
                </span>
                <div className="flex gap-1 flex-wrap mt-1.5">
                  {prog.steps.map((s, i) => (
                    <span
                      key={i}
                      className="text-[10px] font-mono text-text-muted bg-bg-tertiary px-1.5 py-0.5 rounded"
                    >
                      {s.label}
                    </span>
                  ))}
                </div>

                <button
                  type="button"
                  aria-label={`Remover ${prog.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Remover "${prog.name}"?`))
                      remove(prog.id);
                  }}
                  className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-full text-[10px] bg-bg-tertiary border border-border-default text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer opacity-60 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-accent"
                >
                  X
                </button>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Examples */}
      <div>
        <h4 className="font-heading text-sm text-text-secondary mb-2">
          Exemplos
        </h4>
        <div className="flex flex-col sm:flex-row gap-2 sm:flex-wrap">
          {examples.map((prog) => (
            <motion.button
              key={prog.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => loadProgression(prog)}
              className="group text-left px-4 py-3 rounded-lg border border-border-default bg-bg-card hover:border-accent/50 hover:shadow-[var(--shadow-card-hover)] transition-all cursor-pointer"
            >
              <span className="font-heading text-xs text-text-primary block group-hover:text-accent transition-colors">
                {prog.name}
              </span>
              <div className="flex gap-1 flex-wrap mt-1.5">
                {prog.steps.map((s, i) => (
                  <span
                    key={i}
                    className="text-[10px] font-mono text-text-muted bg-bg-tertiary px-1.5 py-0.5 rounded"
                  >
                    {s.label}
                  </span>
                ))}
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
