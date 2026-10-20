import { usePlaybackShortcut } from '@/hooks/usePlaybackShortcut';
import { useAppStore } from '@/store/useAppStore';
import { useStepPlayer } from '@/hooks/useStepPlayer';
import Button from '@/components/shared/Button';
import Tag from '@/components/shared/Tag';

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

  usePlaybackShortcut(() => {
    if (isPlaying) stop();
    else void play();
  }, customProgression.length > 0);

  return (
    <div className="flex items-center gap-3">
      <Button
        variant={isPlaying ? 'default' : 'primary'}
        pressed={isPlaying}
        live={isPlaying}
        onClick={() => (isPlaying ? stop() : play())}
        disabled={customProgression.length === 0}
      >
        <span aria-hidden className="mr-[1ch]">
          {isPlaying ? '\u25A0' : '\u25B6'}
        </span>
        <span className="hidden sm:inline">
          {isPlaying ? 'Parar' : 'Tocar Progressão'}
        </span>
        <span className="sm:hidden">{isPlaying ? 'Parar' : 'Tocar'}</span>
      </Button>

      {isPlaying && <Tag tone="live">tocando</Tag>}
    </div>
  );
}
