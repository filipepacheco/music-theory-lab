import { useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  selectTranscriptionDocument,
  useAppStore,
} from '@/store/useAppStore';
import { transcriptionDocument } from '@/domain/transcriptionDocument';
import { TONE_PRESETS } from '@/constants/tonePresets';
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
  const baseBpm = useAppStore((s) => s.songBaseBpm);
  const setSongBaseBpm = useAppStore((s) => s.setSongBaseBpm);
  const songPresetId = useAppStore((s) => s.songPresetId);
  const setSongPresetId = useAppStore((s) => s.setSongPresetId);
  const songMode = useAppStore((s) => s.songMode);
  // The tempo that plays: base tempo x practice speed. The base never moves.
  const playbackBpm = useAppStore((s) =>
    transcriptionDocument.playbackBpm(selectTranscriptionDocument(s)),
  );

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
    mode: songMode,
    presetId: songPresetId,
    bpm: playbackBpm,
    segmentLengths,
    onSegmentChange: onPlayingSectionChange,
  });

  const hasSteps = songSections.some((s) => s.steps.length > 0);

  const handlePlay = () => {
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
          className={`px-6 py-2.5 rounded-button text-sm font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
            isPlaying
              ? 'bg-red-500 text-white shadow-[0_0_16px_rgba(239,68,68,0.3)]'
              : 'bg-accent text-white shadow-[0_0_16px_rgba(79,110,247,0.3)]'
          }`}
        >
          <span className="flex items-center gap-2">
            <span>{isPlaying ? '\u25A0' : '\u25B6'}</span>
            <span>
              {isPlaying ? 'Parar' : loopSection ? 'Tocar Seção' : 'Tocar Tudo'}
            </span>
          </span>
        </motion.button>

        {/* Loop section toggle */}
        <button
          onClick={() => setLoopSection(!loopSection)}
          className={`px-3 py-1.5 rounded-button text-xs font-medium transition-all cursor-pointer border ${
            loopSection
              ? 'border-accent/40 text-accent bg-accent/10'
              : 'border-border-default text-text-secondary hover:border-accent/40'
          }`}
        >
          {loopSection ? 'Repetir seção' : 'Tocar tudo'}
        </button>

        {isPlaying && (
          <span className="text-xs text-text-muted animate-pulse">
            Tocando...
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[10px] text-text-muted whitespace-nowrap">
          Andamento base
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSongBaseBpm(baseBpm - 5)}
            aria-label="Diminuir andamento base"
            className="w-7 h-7 flex items-center justify-center rounded-button bg-bg-tertiary text-text-secondary hover:text-text-primary text-sm cursor-pointer border border-border-default"
          >
            -
          </button>
          <span className="text-xs font-mono text-text-secondary w-14 text-center">
            {baseBpm} bpm
          </span>
          <button
            onClick={() => setSongBaseBpm(baseBpm + 5)}
            aria-label="Aumentar andamento base"
            className="w-7 h-7 flex items-center justify-center rounded-button bg-bg-tertiary text-text-secondary hover:text-text-primary text-sm cursor-pointer border border-border-default"
          >
            +
          </button>
        </div>
        <label className="flex items-center gap-2 text-[10px] text-text-muted">
          Timbre
          <select
            value={songPresetId}
            onChange={(e) => setSongPresetId(e.target.value)}
            className="bg-bg-tertiary text-text-primary border border-border-default rounded-control px-2 py-1 text-xs font-mono focus:outline-none focus:border-border-focus cursor-pointer"
          >
            {TONE_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <SpeedControl
        percent={practiceSpeed}
        onChange={setPracticeSpeed}
        originalBpm={baseBpm}
      />
    </div>
  );
}
