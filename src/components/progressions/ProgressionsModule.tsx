import { AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import ProgressionChordPicker from "./ProgressionChordPicker";
import ChromaticChordPicker from "@/components/shared/ChromaticChordPicker";
import ProgressionTimeline from "./ProgressionTimeline";
import PlaybackControls from "./PlaybackControls";
import PresetList from "./PresetList";
import ProgressionAnalysis from "./ProgressionAnalysis";
import BeatTimeline from "@/components/harmonicField/BeatTimeline";
import ProgressionChordStrip from "@/components/harmonicField/ProgressionChordStrip";

export default function ProgressionsModule() {
  const playingProgression = useAppStore((s) => s.playingProgression);
  const customProgression = useAppStore((s) => s.customProgression);
  const addProgressionStep = useAppStore((s) => s.addProgressionStep);

  return (
    <section className="flex flex-col gap-4 sm:gap-6">
      <div>
        <h2 className="font-heading text-lg text-text-primary mb-4">
          Construtor de Progressoes
        </h2>

        <div className="section-panel flex flex-col gap-4">
          <ProgressionChordPicker />
          <ChromaticChordPicker
            stepCount={customProgression.length}
            onSelect={addProgressionStep}
          />
          <ProgressionTimeline />
          <PlaybackControls />

          <AnimatePresence>
            {playingProgression && <BeatTimeline key="beat-timeline" />}
            {playingProgression && (
              <ProgressionChordStrip key="chord-strip" />
            )}
          </AnimatePresence>
        </div>
      </div>

      <ProgressionAnalysis />
      <PresetList />
    </section>
  );
}
