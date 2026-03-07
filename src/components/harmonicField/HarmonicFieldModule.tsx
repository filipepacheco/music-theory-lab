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
    <section className="flex flex-col gap-5 sm:gap-8">
      <div>
        {/* Mobile: title + compact legend on same line */}
        <div className="flex items-center justify-between mb-3 sm:hidden">
          <h2 className="font-heading text-lg font-bold text-text-primary">
            Campo Harmonico
          </h2>
          <FunctionLegend compact />
        </div>

        {/* Desktop: separate title and full legend */}
        <h2 className="hidden sm:block font-heading text-lg text-text-primary mb-4">
          Campo Harmonico
        </h2>

        <div className="section-panel flex flex-col gap-4">
          <div className="hidden sm:block">
            <FunctionLegend />
          </div>
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
