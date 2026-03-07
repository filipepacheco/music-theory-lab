import { motion } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';
import { TIME_SIGNATURES } from '@/constants/structureColors';

export default function StructureRecorder() {
  const addBarToSection = useAppStore((s) => s.addBarToSection);
  const activeTimeSignature = useAppStore((s) => s.activeTimeSignature);
  const setActiveTimeSignature = useAppStore((s) => s.setActiveTimeSignature);
  const barCount = useAppStore((s) => s.structureBars.length);
  const focusedSectionId = useAppStore((s) => s.focusedSectionId);
  const sections = useAppStore((s) => s.structureSections);

  const focusedSection = sections.find((s) => s.id === focusedSectionId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary font-medium">
            Compasso:
          </span>
          <div className="flex gap-1 bg-bg-tertiary/50 rounded-lg p-1">
            {TIME_SIGNATURES.map((ts) => (
              <button
                key={ts}
                onClick={() => setActiveTimeSignature(ts)}
                className={`px-2.5 sm:px-3 py-2 rounded-md text-sm font-mono transition-all cursor-pointer ${
                  activeTimeSignature === ts
                    ? 'bg-bg-card text-text-primary shadow-sm ring-1 ring-border-default'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-card/50'
                }`}
              >
                {ts}
              </button>
            ))}
          </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            if (focusedSectionId) addBarToSection(focusedSectionId);
          }}
          disabled={!focusedSectionId}
          className="flex items-center gap-1.5 px-4 sm:px-5 py-2.5 rounded-lg text-sm font-medium border border-accent/40 text-accent hover:bg-accent/10 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Compasso
        </motion.button>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-text-muted font-mono">
          {barCount} {barCount === 1 ? 'compasso' : 'compassos'}
        </span>
        {focusedSection ? (
          <span className="text-[11px] text-text-muted/80">
            Adicionando a:{' '}
            <span style={{ color: focusedSection.color }} className="font-medium">
              {focusedSection.name}
            </span>
          </span>
        ) : (
          <span className="text-[11px] text-text-muted/60">
            Selecione uma secao
          </span>
        )}
      </div>
    </div>
  );
}
