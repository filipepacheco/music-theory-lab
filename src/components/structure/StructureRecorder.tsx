import { motion } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';
import type { TimeSignature } from '@/types';

const TIME_SIGNATURES: TimeSignature[] = ['2/4', '3/4', '4/4', '6/8'];

export default function StructureRecorder() {
  const addBar = useAppStore((s) => s.addBar);
  const activeTimeSignature = useAppStore((s) => s.activeTimeSignature);
  const setActiveTimeSignature = useAppStore((s) => s.setActiveTimeSignature);
  const barCount = useAppStore((s) => s.structureBars.length);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-text-secondary">Compasso:</span>
        <div className="flex gap-0.5 bg-bg-tertiary/50 rounded-lg p-0.5">
          {TIME_SIGNATURES.map((ts) => (
            <button
              key={ts}
              onClick={() => setActiveTimeSignature(ts)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-mono transition-all cursor-pointer ${
                activeTimeSignature === ts
                  ? 'bg-bg-card text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
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
        onClick={addBar}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-accent/40 text-accent hover:bg-accent/10 transition-all cursor-pointer"
      >
        + Compasso
      </motion.button>

      <span className="text-xs text-text-muted font-mono">
        {barCount} {barCount === 1 ? 'compasso' : 'compassos'}
      </span>

      <span className="text-xs text-text-muted">
        Espaco = adicionar compasso
      </span>
    </div>
  );
}
