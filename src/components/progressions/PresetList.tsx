import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useSavedProgressions } from '@/hooks/useSavedProgressions';
import SaveProgressionDialog from '@/components/progressions/SaveProgressionDialog';
import { confirmDialog } from '@/services/confirm';
import Button from '@/components/shared/Button';

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
        Carregando progressões...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Save button */}
      {customProgression.length > 0 && (
        <Button onClick={() => setShowSave(true)}>+ Salvar progressão</Button>
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
            Suas progressões
          </h3>
          <div className="flex flex-col sm:flex-row gap-2 sm:flex-wrap">
            {userSaved.map((prog) => (
              <div key={prog.id} className="relative flex">
                <button
                  type="button"
                  onClick={() => loadProgression(prog)}
                  className="flex-1 text-left px-4 py-3 border border-border-default bg-bg-card hover:border-accent hover:shadow-lift active:translate-x-px active:translate-y-px cursor-pointer"
                >
                  <span className="font-heading text-xs text-text-primary block pr-6">
                    {prog.name}
                  </span>
                  <span className="flex gap-1 flex-wrap mt-1.5">
                    {prog.steps.map((s, i) => (
                      <span
                        key={i}
                        className="text-micro font-mono text-text-muted bg-bg-tertiary px-1.5 py-0.5"
                      >
                        {s.label}
                      </span>
                    ))}
                  </span>
                </button>

                <button
                  type="button"
                  aria-label={`Remover ${prog.name}`}
                  onClick={async () => {
                    const confirmed = await confirmDialog({
                      title: `Remover "${prog.name}"?`,
                      confirmLabel: 'Remover',
                      danger: true,
                    });
                    if (confirmed) remove(prog.id);
                  }}
                  className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center text-micro bg-bg-tertiary border border-border-default text-text-muted hover:bg-danger hover:text-on-accent cursor-pointer opacity-60 hover:opacity-100"
                >
                  X
                </button>
              </div>
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
            <button
              key={prog.id}
              onClick={() => loadProgression(prog)}
              className="group text-left px-4 py-3 border border-border-default bg-bg-card hover:border-accent hover:shadow-lift active:translate-x-px active:translate-y-px cursor-pointer"
            >
              <span className="font-heading text-xs text-text-primary block">
                {prog.name}
              </span>
              <div className="flex gap-1 flex-wrap mt-1.5">
                {prog.steps.map((s, i) => (
                  <span
                    key={i}
                    className="text-micro font-mono text-text-muted bg-bg-tertiary px-1.5 py-0.5"
                  >
                    {s.label}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
