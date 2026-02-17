import { AnimatePresence } from "framer-motion";
import FunctionLegend from "./FunctionLegend";
import ChordGrid from "./ChordGrid";
import ProgressionExamples from "./ProgressionExamples";
import BeatTimeline from "./BeatTimeline";
import ProgressionChordStrip from "./ProgressionChordStrip";
import TeacherTip from "@/components/shared/TeacherTip";
import { useAppStore } from "@/store/useAppStore";

export default function HarmonicFieldModule() {
  const playingProgression = useAppStore((s) => s.playingProgression);

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="font-heading text-lg text-text-primary mb-4">
          Campo Harmonico
        </h2>
        <div className="section-panel flex flex-col gap-4">
          <FunctionLegend />
          <ChordGrid />
        </div>
      </div>
      <TeacherTip />
      <ProgressionExamples />
      <AnimatePresence>
        {playingProgression && <BeatTimeline />}
        {playingProgression && <ProgressionChordStrip />}
      </AnimatePresence>
    </section>
  );
}
