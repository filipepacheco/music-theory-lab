import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';
import { getNoteName } from '@/utils/noteHelpers';
import GpImportControl from './GpImportControl';
import TranscriptionChordPicker from './TranscriptionChordPicker';
import TranscriptionReviewWorkspace from './TranscriptionReviewWorkspace';
import SongPlaybackControls from './SongPlaybackControls';
import SaveSongButton from './SaveSongButton';
import SongList from './SongList';
import HearKeyButton from './HearKeyButton';
import BeatTimeline from '@/components/harmonicField/BeatTimeline';
import ProgressionChordStrip from '@/components/harmonicField/ProgressionChordStrip';

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
    <section className="flex flex-col gap-6">
      <div>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.14em] text-accent">
              Revisão focada
            </p>
            <input
              type="text"
              value={songTitle}
              onChange={(event) => setSongTitle(event.target.value)}
              placeholder="Título da música"
              className="mt-1 w-full max-w-2xl truncate bg-transparent font-heading text-2xl text-text-primary placeholder:text-text-muted focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span>{chordCountLabel}</span>
              <span>·</span>
              <span
                className={
                  reviewCount > 0 ? 'text-amber-200' : 'text-emerald-300'
                }
              >
                {reviewCount > 0
                  ? `${reviewCount} para revisar`
                  : 'Tudo revisado'}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SaveSongButton />
            {(activeSongId || songSections.length > 0) && (
              <button
                type="button"
                onClick={clearSong}
                className="text-xs text-text-muted transition-colors hover:text-text-primary"
              >
                Nova transcrição
              </button>
            )}
          </div>
        </div>

        <div className="section-panel flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 border-b border-border-default pb-4">
            <input
              type="text"
              value={songArtist}
              onChange={(event) => setSongArtist(event.target.value)}
              placeholder="Artista"
              className="min-w-[180px] flex-1 rounded-lg border border-border-default bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <span className="rounded-lg border border-border-default bg-bg-tertiary px-3 py-2 text-xs font-mono text-text-secondary">
              {keyDisplay}
            </span>
            <HearKeyButton />
          </div>

          <GpImportControl />

          <TranscriptionReviewWorkspace />

          {songSections.length > 0 && (
            <div className="rounded-2xl border border-border-default bg-bg-tertiary/20">
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
                  <span className="mt-1 block text-[10px] text-text-muted">
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
            <div className="rounded-2xl border border-border-default bg-bg-tertiary/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium text-text-primary">
                    Prática
                  </h3>
                  <p className="mt-1 text-[10px] text-text-muted">
                    Ouça a seção atual ou a música inteira.
                  </p>
                </div>
                <span className="text-xs text-text-muted">
                  {playingSectionIndex !== undefined
                    ? 'Tocando seção'
                    : 'Pronto para tocar'}
                </span>
              </div>
              <SongPlaybackControls
                onPlayingSectionChange={setPlayingSectionIndex}
              />
            </div>
          )}

          <AnimatePresence>
            {playingProgression?.id === '__song__' && (
              <BeatTimeline key="beat-timeline" />
            )}
            {playingProgression?.id === '__song__' && (
              <ProgressionChordStrip key="chord-strip" />
            )}
          </AnimatePresence>
        </div>
      </div>

      <SongList />
    </section>
  );
}
