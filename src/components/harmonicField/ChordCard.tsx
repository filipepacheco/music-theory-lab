import { memo } from "react";
import { motion } from "framer-motion";
import type { HarmonicFunction } from "@/constants/harmonicFields";
import Badge from "@/components/shared/Badge";

const FUNCTION_BORDER_COLORS: Record<HarmonicFunction, string> = {
  T: "var(--color-tonic)",
  SD: "var(--color-subdominant)",
  D: "var(--color-dominant)",
};

const FUNCTION_GLOW_COLORS: Record<HarmonicFunction, string> = {
  T: "rgba(59, 130, 246, 0.35)",
  SD: "rgba(34, 197, 94, 0.35)",
  D: "rgba(249, 115, 22, 0.35)",
};

interface ChordCardProps {
  romanNumeral: string;
  chordName: string;
  harmonicFunction: HarmonicFunction;
  noteNames: string[];
  intervals: number[];
  isSelected: boolean;
  index: number;
  onClick: () => void;
}

const ChordCard = memo(function ChordCard({
  romanNumeral,
  chordName,
  harmonicFunction,
  noteNames,
  isSelected,
  index,
  onClick,
}: ChordCardProps) {
  const borderColor = FUNCTION_BORDER_COLORS[harmonicFunction];
  const glowColor = FUNCTION_GLOW_COLORS[harmonicFunction];

  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      aria-label={`${romanNumeral} - ${chordName}`}
      aria-pressed={isSelected}
      className="flex flex-col items-center gap-1.5 sm:gap-2 py-3 px-2.5 sm:p-4 rounded-xl sm:rounded-lg bg-bg-card border transition-shadow cursor-pointer min-w-20 sm:min-w-[100px] shrink-0 sm:shrink sm:flex-1"
      style={{
        borderColor: isSelected ? borderColor : "var(--color-border-default)",
        borderWidth: isSelected ? 2 : 1,
        boxShadow: isSelected
          ? `0 0 20px ${glowColor}, 0 0 6px ${glowColor}`
          : "var(--shadow-card)",
      }}
    >
      {/* Roman numeral */}
      <span className="font-heading text-[20px] sm:text-lg font-extrabold sm:font-bold text-text-primary leading-none">
        {romanNumeral}
      </span>

      {/* Chord name */}
      <span className="text-[12px] sm:text-sm font-medium sm:font-normal font-mono text-text-secondary">
        {chordName}
      </span>

      {/* Function badge */}
      <Badge harmonicFunction={harmonicFunction} />

      {/* Notes */}
      <div className="flex gap-1 flex-wrap justify-center">
        {noteNames.map((n, i) => (
          <span
            key={i}
            className="text-[10px] font-mono text-text-primary px-1 sm:px-2 py-0.5 rounded-[3px] sm:rounded"
            style={{ backgroundColor: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}
          >
            {n}
          </span>
        ))}
      </div>
    </motion.button>
  );
});

export default ChordCard;
