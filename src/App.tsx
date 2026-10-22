import { useLayoutEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Header from '@/components/layout/Header';
import KeySelector from '@/components/layout/KeySelector';
import BottomNav from '@/components/layout/BottomNav';
import HarmonicFieldModule from '@/components/harmonicField/HarmonicFieldModule';
import ProgressionsModule from '@/components/progressions/ProgressionsModule';
import ScalesModule from '@/components/scales/ScalesModule';
import QuizModule from '@/components/quiz/QuizModule';
import TranscriptionModule from '@/components/transcription/TranscriptionModule';
import StructureModule from '@/components/structure/StructureModule';
import LibraryModule from '@/components/library/LibraryModule';
import AnalyzeModule from '@/components/analyze/AnalyzeModule';
import ConfirmHost from '@/components/shared/ConfirmHost';
import Frame from '@/components/shared/Frame';
import Piano from '@/components/instruments/Piano';
import BassNeck from '@/components/instruments/BassNeck';
import { useAppStore } from '@/store/useAppStore';
import '@/components/layout/appShell.css';

export default function App() {
  const activeModule = useAppStore((s) => s.activeModule);
  const instrumentsPanelOpen = useAppStore((s) => s.instrumentsPanelOpen);
  const setInstrumentsPanelOpen = useAppStore((s) => s.setInstrumentsPanelOpen);
  const theme = useAppStore((s) => s.theme);
  const showInstruments = activeModule !== 'library';

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  return (
    <div className="app-shell bg-bg-primary text-text-primary overflow-x-hidden pb-24 sm:pb-0">
      <Header />
      <KeySelector />

      <main
        className={`px-4 sm:px-6 lg:px-8 py-6 app-workspace gap-8 max-w-full ${
          showInstruments ? '' : 'is-single'
        }`}
      >
        <div className="module-workspace">
          {activeModule === 'harmonicField' && <HarmonicFieldModule />}
          {activeModule === 'progressions' && <ProgressionsModule />}
          {activeModule === 'scales' && <ScalesModule />}
          {activeModule === 'quiz' && <QuizModule />}
          {activeModule === 'transcription' && <TranscriptionModule />}
          {activeModule === 'structure' && <StructureModule />}
          {activeModule === 'library' && <LibraryModule />}
          {activeModule === 'analyze' && import.meta.env.DEV && (
            <AnalyzeModule />
          )}
        </div>
        {showInstruments && (
          <Frame
            className="instrument-workspace"
            collapsed={!instrumentsPanelOpen}
            titleAs="h3"
            title={
              <button
                onClick={() => setInstrumentsPanelOpen(!instrumentsPanelOpen)}
                aria-expanded={instrumentsPanelOpen}
                className="cursor-pointer uppercase hover:text-text-primary focus-visible:bg-accent focus-visible:text-on-accent"
              >
                {instrumentsPanelOpen ? '[-]' : '[+]'} Instrumentos
              </button>
            }
          >
            <AnimatePresence initial={false}>
              {instrumentsPanelOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-1 gap-6">
                    <Piano />
                    <div className="min-w-0 overflow-hidden">
                      <BassNeck />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Frame>
        )}
      </main>

      <BottomNav />
      <ConfirmHost />
    </div>
  );
}
