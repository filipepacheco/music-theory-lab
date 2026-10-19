import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import Callout from "@/components/shared/Callout";
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
        >
          <Callout title={explanation.title}>
            <p>{explanation.description}</p>
          </Callout>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
