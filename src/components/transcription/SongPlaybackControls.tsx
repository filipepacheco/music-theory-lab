import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';
import { useStepPlayer } from '@/hooks/useStepPlayer';
import SpeedControl from '@/components/shared/SpeedControl';
import type { ProgressionStep } from '@/constants/progressions';

export default function SongPlaybackControls({
  onPlayingSectionChange,
}: {
  onPlayingSectionChange?: (sectionIndex: number | undefined) => void;
}) {
  const songSections = useAppStore((s) => s.songSections);
  const activeSectionIndex = useAppStore((s) => s.activeSectionIndex);
  const loopSection = useAppStore((s) => s.loopSection);
  const setLoopSection = useAppStore((s) => s.setLoopSection);
  const practiceSpeed = useAppStore((s) => s.practiceSpeed);
  const setPracticeSpeed = useAppStore((s) => s.setPracticeSpeed);
  const bpm = useAppStore((s) => s.bpm);
  const setBpm = useAppStore((s) => s.setBpm);
  const isMinor = useAppStore((s) => s.isMinor);
  const activePresetId = useAppStore((s) => s.activePresetId);

  const [originalBpm, setOriginalBpm] = useState(bpm);

  // Compute which steps to play based on loopSection
  const getPlaybackSteps = useCallback((): ProgressionStep[] => {
    if (loopSection) {
      const section = songSections[activeSectionIndex];
      return section?.steps ?? [];
    }
    return songSections.flatMap((s) => s.steps);
  }, [songSections, activeSectionIndex, loopSection]);

  const segmentLengths = loopSection
    ? undefined
    : songSections.map((section) =>
        section.steps.reduce(
          (sum, step) => sum + Math.round((step.beats ?? 4) * 2),
          0,
        ),
      );

  const { play, stop, isPlaying } = useStepPlayer({
    id: '__song__',
    steps: [],
    mode: isMinor ? 'minor' : 'major',
    presetId: activePresetId,
    bpm,
    segmentLengths,
    onSegmentChange: onPlayingSectionChange,
  });

  const hasSteps = songSections.some((s) => s.steps.length > 0);

  const handleSpeedChange = (percent: number) => {
    setPracticeSpeed(percent);
    const effectiveBpm = Math.round((originalBpm * percent) / 100);
    setBpm(effectiveBpm);
  };

  const handlePlay = () => {
    setOriginalBpm(bpm);
    play({ steps: getPlaybackSteps() });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <motion.button
          onClick={() => (isPlaying ? stop() : handlePlay())}
          disabled={!hasSteps}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
            isPlaying
              ? 'bg-red-500 text-white shadow-[0_0_16px_rgba(239,68,68,0.3)]'
              : 'bg-accent text-white shadow-[0_0_16px_rgba(79,110,247,0.3)]'
          }`}
        >
          <span className="flex items-center gap-2">
            <span>{isPlaying ? '\u25A0' : '\u25B6'}</span>
            <span>
              {isPlaying ? 'Parar' : loopSection ? 'Tocar Secao' : 'Tocar Tudo'}
            </span>
          </span>
        </motion.button>

        {/* Loop section toggle */}
        <button
          onClick={() => setLoopSection(!loopSection)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
            loopSection
              ? 'border-accent/40 text-accent bg-accent/10'
              : 'border-border-default text-text-secondary hover:border-accent/40'
          }`}
        >
          {loopSection ? 'Repetir secao' : 'Tocar tudo'}
        </button>

        {isPlaying && (
          <span className="text-xs text-text-muted animate-pulse">
            Tocando...
          </span>
        )}
      </div>

      <SpeedControl
        percent={practiceSpeed}
        onChange={handleSpeedChange}
        originalBpm={originalBpm}
      />
    </div>
  );
}
