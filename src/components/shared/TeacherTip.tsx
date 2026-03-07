import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import {
  DEGREE_EXPLANATIONS_MAJOR,
  DEGREE_EXPLANATIONS_MINOR,
} from "@/constants/explanations";

export default function TeacherTip() {
  const selectedChordIndex = useAppStore((s) => s.selectedChordIndex);
  const isMinor = useAppStore((s) => s.isMinor);

  const explanations = isMinor
    ? DEGREE_EXPLANATIONS_MINOR
    : DEGREE_EXPLANATIONS_MAJOR;
  const explanation =
    selectedChordIndex !== null ? explanations[selectedChordIndex] : null;

  return (
    <AnimatePresence mode="wait">
      {explanation && (
        <motion.div
          key={`${isMinor}-${selectedChordIndex}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="bg-bg-card border border-border-default rounded-[10px] sm:rounded-lg py-3 px-3.5 sm:p-4 mt-3 sm:mt-4 flex flex-col gap-1.5 sm:gap-0"
        >
          <h4 className="font-heading text-[13px] sm:text-sm text-accent">
            {explanation.title}
          </h4>
          <p className="text-[13px] sm:text-sm text-text-secondary leading-relaxed">
            {explanation.description}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
