import { useCallback, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useStepPlayer } from '@/hooks/useStepPlayer';
import SpeedControl from '@/components/shared/SpeedControl';
import type { ProgressionStep } from '@/constants/progressions';
import Button from '@/components/shared/Button';
import Tag from '@/components/shared/Tag';

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
        <Button
          variant={isPlaying ? 'default' : 'primary'}
          pressed={isPlaying}
          live={isPlaying}
          onClick={() => (isPlaying ? stop() : handlePlay())}
          disabled={!hasSteps}
        >
          <span aria-hidden className="mr-[1ch]">
            {isPlaying ? '\u25A0' : '\u25B6'}
          </span>
          {isPlaying ? 'Parar' : loopSection ? 'Tocar Seção' : 'Tocar Tudo'}
        </Button>

        {/* Loop section toggle */}
        <Button
          size="sm"
          pressed={loopSection}
          onClick={() => setLoopSection(!loopSection)}
        >
          {loopSection ? 'Repetir seção' : 'Tocar tudo'}
        </Button>

        {isPlaying && <Tag tone="live">tocando</Tag>}
      </div>

      <SpeedControl
        percent={practiceSpeed}
        onChange={handleSpeedChange}
        originalBpm={originalBpm}
      />
    </div>
  );
}
