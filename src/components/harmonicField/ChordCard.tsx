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
  T: "var(--color-tonic-glow)",
  SD: "var(--color-subdominant-glow)",
  D: "var(--color-dominant-glow)",
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
      className="flex flex-col items-center gap-2 p-4 rounded-lg bg-bg-card border transition-shadow cursor-pointer min-w-[100px] flex-1"
      style={{
        borderColor: isSelected ? borderColor : "var(--color-border-default)",
        boxShadow: isSelected
          ? `0 0 16px ${glowColor}`
          : "var(--shadow-card)",
      }}
    >
      {/* Roman numeral */}
      <span className="font-heading text-lg text-text-primary">
        {romanNumeral}
      </span>

      {/* Chord name */}
      <span className="font-mono text-sm text-text-secondary">{chordName}</span>

      {/* Function badge */}
      <Badge harmonicFunction={harmonicFunction} />

      {/* Notes */}
      <div className="flex gap-1 flex-wrap justify-center">
        {noteNames.map((n, i) => (
          <span
            key={i}
            className="text-[10px] font-mono text-text-muted bg-bg-tertiary px-1.5 py-0.5 rounded"
          >
            {n}
          </span>
        ))}
      </div>
    </motion.button>
  );
});

export default ChordCard;
