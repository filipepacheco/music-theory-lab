import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';
import { getNoteName } from '@/utils/noteHelpers';
import GpImportPanel from './GpImportPanel';
import TranscriptionChordPicker from './TranscriptionChordPicker';
import TranscriptionReviewWorkspace from './TranscriptionReviewWorkspace';
import SongPlaybackControls from './SongPlaybackControls';
import SaveSongButton from './SaveSongButton';
import SongList from './SongList';
import HearKeyButton from './HearKeyButton';
import BeatTimeline from '@/components/harmonicField/BeatTimeline';
import ProgressionChordStrip from '@/components/harmonicField/ProgressionChordStrip';
import Frame from '@/components/shared/Frame';
import Button from '@/components/shared/Button';
import Field from '@/components/shared/Field';
import Tag from '@/components/shared/Tag';
import '@/components/transcription/transcriptionLayout.css';

export default function TranscriptionModule() {
  const songSections = useAppStore((state) => state.songSections);
  const clearSong = useAppStore((state) => state.clearSong);
  const activeSongId = useAppStore((state) => state.activeSongId);
  const songTitle = useAppStore((state) => state.songTitle);
  const songArtist = useAppStore((state) => state.songArtist);
  const setSongTitle = useAppStore((state) => state.setSongTitle);
  const setSongArtist = useAppStore((state) => state.setSongArtist);
  const rootNote = useAppStore((state) => state.rootNote);
  const isMinor = useAppStore((state) => state.isMinor);
  const playingProgression = useAppStore((state) => state.playingProgression);

  const [playingSectionIndex, setPlayingSectionIndex] = useState<
    number | undefined
  >(undefined);
  const [showChordPicker, setShowChordPicker] = useState(false);

  const hasSteps = songSections.some((section) => section.steps.length > 0);
  const chordCount = songSections.reduce(
    (total, section) => total + section.steps.length,
    0,
  );
  const reviewCount = songSections.reduce(
    (total, section) =>
      total +
      section.steps.filter((step) => step.confidence === 'unsure').length,
    0,
  );
  const chordCountLabel =
    chordCount === 1 ? '1 acorde' : `${chordCount} acordes`;
  const keyDisplay = `${getNoteName(rootNote)} ${isMinor ? 'menor' : 'maior'}`;

  return (
    <section className="transcription-module min-w-0 flex flex-col gap-6">
      <div>
        <div className="transcription-heading mb-4">
          <div className="min-w-0 flex-1">
            <p className="lh-label">Revisão focada</p>
            <input
              type="text"
              value={songTitle}
              onChange={(event) => setSongTitle(event.target.value)}
              placeholder="Título da música"
              className="mt-1 w-full max-w-2xl truncate bg-transparent font-heading text-2xl text-text-primary placeholder:text-text-muted"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span>{chordCountLabel}</span>
              <span>·</span>
              <span
                className={reviewCount > 0 ? 'text-warning' : 'text-success'}
              >
                {reviewCount > 0
                  ? `${reviewCount} para revisar`
                  : 'Tudo revisado'}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SaveSongButton />
            {(activeSongId || songSections.length > 0) && (
              <Button onClick={clearSong} size="sm">
                Nova transcrição
              </Button>
            )}
          </div>
        </div>

        <Frame title="Transcrição" titleAs="h2" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 border-b border-border-default pb-4">
            <Field
              type="text"
              value={songArtist}
              onChange={(event) => setSongArtist(event.target.value)}
              placeholder="Artista"
              aria-label="Artista"
              className="min-w-[180px]"
            />
            <Tag tone="bright">{keyDisplay}</Tag>
            <HearKeyButton />
          </div>

          <GpImportPanel />

          <TranscriptionReviewWorkspace />

          {songSections.length > 0 && (
            <div className="border border-border-default bg-bg-tertiary/20">
              <button
                type="button"
                onClick={() => setShowChordPicker((current) => !current)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                aria-expanded={showChordPicker}
              >
                <span>
                  <span className="block text-sm font-medium text-text-primary">
                    Adicionar acorde manualmente
                  </span>
                  <span className="mt-1 block text-micro text-text-muted">
                    Use o campo harmônico ou escolha um acorde cromático para a
                    seção ativa.
                  </span>
                </span>
                <span className="text-sm text-text-muted">
                  {showChordPicker ? '−' : '+'}
                </span>
              </button>
              {showChordPicker && (
                <div className="border-t border-border-default p-4">
                  <TranscriptionChordPicker />
                </div>
              )}
            </div>
          )}

          {hasSteps && (
            <Frame
              title="Prática"
              titleAs="h3"
              variant="double"
              live={playingSectionIndex !== undefined}
              foot={
                playingSectionIndex !== undefined
                  ? 'tocando seção'
                  : 'pronto para tocar'
              }
              className="flex flex-col gap-3"
            >
              <p className="lh-meta-text">
                Ouça a seção atual ou a música inteira.
              </p>
              <SongPlaybackControls
                onPlayingSectionChange={setPlayingSectionIndex}
              />
            </Frame>
          )}

          <AnimatePresence>
            {playingProgression?.id === '__song__' && (
              <BeatTimeline key="beat-timeline" />
            )}
            {playingProgression?.id === '__song__' && (
              <ProgressionChordStrip key="chord-strip" />
            )}
          </AnimatePresence>
        </Frame>
      </div>

      <SongList />
    </section>
  );
}
