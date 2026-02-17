import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';
import SongMetadataBar from './SongMetadataBar';
import SectionTabs from './SectionTabs';
import TranscriptionChordPicker from './TranscriptionChordPicker';
import SectionTimeline from './SectionTimeline';
import SongPlaybackControls from './SongPlaybackControls';
import SaveSongButton from './SaveSongButton';
import SongList from './SongList';
import BeatTimeline from '@/components/harmonicField/BeatTimeline';
import ProgressionChordStrip from '@/components/harmonicField/ProgressionChordStrip';

export default function TranscriptionModule() {
  const songSections = useAppStore((s) => s.songSections);
  const clearSong = useAppStore((s) => s.clearSong);
  const activeSongId = useAppStore((s) => s.activeSongId);
  const playingProgression = useAppStore((s) => s.playingProgression);

  const [playingSectionIndex, setPlayingSectionIndex] = useState<
    number | undefined
  >(undefined);

  const hasSteps = songSections.some((s) => s.steps.length > 0);

  return (
    <section className="flex flex-col gap-6">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-lg text-text-primary">
            Transcricao
          </h2>
          {(activeSongId || songSections.length > 0) && (
            <button
              onClick={clearSong}
              className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            >
              Nova transcricao
            </button>
          )}
        </div>

        <div className="section-panel flex flex-col gap-4">
          <SongMetadataBar />
          <SectionTabs playingSectionIndex={playingSectionIndex} />
          {songSections.length > 0 && <TranscriptionChordPicker />}
          {songSections.length > 0 && <SectionTimeline />}

          {hasSteps && (
            <SongPlaybackControls
              onPlayingSectionChange={setPlayingSectionIndex}
            />
          )}

          <AnimatePresence>
            {playingProgression?.id === '__song__' && (
              <BeatTimeline key="beat-timeline" />
            )}
            {playingProgression?.id === '__song__' && (
              <ProgressionChordStrip key="chord-strip" />
            )}
          </AnimatePresence>

          <div className="flex items-center gap-3">
            <SaveSongButton />
          </div>
        </div>
      </div>

      <SongList />
    </section>
  );
}
