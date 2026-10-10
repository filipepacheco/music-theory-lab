import { AnimatePresence } from "framer-motion";
import FunctionLegend from "./FunctionLegend";
import ChordGrid from "./ChordGrid";
import ProgressionExamples from "./ProgressionExamples";
import BeatTimeline from "./BeatTimeline";
import ProgressionChordStrip from "./ProgressionChordStrip";
import TeacherTip from "@/components/shared/TeacherTip";
import { useAppStore } from "@/store/useAppStore";
import Frame from "@/components/shared/Frame";

export default function HarmonicFieldModule() {
  const playingProgression = useAppStore((s) => s.playingProgression);

  return (
    <section className="flex flex-col gap-5 sm:gap-8">
      <Frame
        title="Campo Harmônico"
        titleAs="h2"
        className="flex flex-col gap-4"
      >
        <div className="flex justify-end sm:hidden">
          <FunctionLegend compact />
        </div>
        <div className="hidden sm:block">
          <FunctionLegend />
        </div>
        <ChordGrid />
      </Frame>
      <TeacherTip />
      <ProgressionExamples />
      <AnimatePresence>
        {playingProgression && <BeatTimeline />}
        {playingProgression && <ProgressionChordStrip />}
      </AnimatePresence>
    </section>
  );
}
