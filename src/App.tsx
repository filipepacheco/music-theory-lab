import { AnimatePresence, motion } from "framer-motion";
import Header from "@/components/layout/Header";
import KeySelector from "@/components/layout/KeySelector";
import HarmonicFieldModule from "@/components/harmonicField/HarmonicFieldModule";
import ProgressionsModule from "@/components/progressions/ProgressionsModule";
import ScalesModule from "@/components/scales/ScalesModule";
import QuizModule from "@/components/quiz/QuizModule";
import TranscriptionModule from "@/components/transcription/TranscriptionModule";
import StructureModule from "@/components/structure/StructureModule";
import Piano from "@/components/instruments/Piano";
import BassNeck from "@/components/instruments/BassNeck";
import { useAppStore } from "@/store/useAppStore";

export default function App() {
  const activeModule = useAppStore((s) => s.activeModule);
  const instrumentsPanelOpen = useAppStore((s) => s.instrumentsPanelOpen);
  const setInstrumentsPanelOpen = useAppStore(
    (s) => s.setInstrumentsPanelOpen,
  );

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <Header />
      <KeySelector />

      <main className="px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-8">
        {activeModule === "harmonicField" && <HarmonicFieldModule />}
        {activeModule === "progressions" && <ProgressionsModule />}
        {activeModule === "scales" && <ScalesModule />}
        {activeModule === "quiz" && <QuizModule />}
        {activeModule === "transcription" && <TranscriptionModule />}
        {activeModule === "structure" && <StructureModule />}

        <div className="section-panel">
          <button
            onClick={() => setInstrumentsPanelOpen(!instrumentsPanelOpen)}
            aria-expanded={instrumentsPanelOpen}
            className="flex items-center justify-between w-full cursor-pointer focus-visible:ring-2 focus-visible:ring-accent rounded"
          >
            <h3 className="font-heading text-sm text-text-secondary">
              Instrumentos
            </h3>
            <motion.span
              animate={{ rotate: instrumentsPanelOpen ? 0 : -90 }}
              transition={{ duration: 0.2 }}
              className="text-text-muted text-sm"
            >
              &#9660;
            </motion.span>
          </button>

          <AnimatePresence initial={false}>
            {instrumentsPanelOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
                  <Piano />
                  <BassNeck />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
