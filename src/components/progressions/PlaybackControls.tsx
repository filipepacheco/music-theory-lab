import { motion } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';
import { useStepPlayer } from '@/hooks/useStepPlayer';

export default function PlaybackControls() {
  const customProgression = useAppStore((s) => s.customProgression);
  const isMinor = useAppStore((s) => s.isMinor);
  const activePresetId = useAppStore((s) => s.activePresetId);
  const bpm = useAppStore((s) => s.bpm);

  const { play, stop, isPlaying } = useStepPlayer({
    id: '__custom__',
    steps: customProgression,
    mode: isMinor ? 'minor' : 'major',
    presetId: activePresetId,
    bpm,
  });

  return (
    <div className="flex items-center gap-3">
      <motion.button
        onClick={() => (isPlaying ? stop() : play())}
        disabled={customProgression.length === 0}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        className={`px-4 sm:px-6 py-2.5 rounded-button text-sm font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
          isPlaying
            ? 'bg-red-500 text-white shadow-[0_0_16px_rgba(239,68,68,0.3)]'
            : 'bg-accent text-white shadow-[0_0_16px_rgba(79,110,247,0.3)]'
        }`}
      >
        <span className="flex items-center gap-2">
          <span>{isPlaying ? '\u25A0' : '\u25B6'}</span>
          <span className="hidden sm:inline">
            {isPlaying ? 'Parar' : 'Tocar Progressão'}
          </span>
          <span className="sm:hidden">{isPlaying ? 'Parar' : 'Tocar'}</span>
        </span>
      </motion.button>

      {isPlaying && (
        <span className="text-xs text-text-muted animate-pulse">
          Tocando...
        </span>
      )}
    </div>
  );
}
