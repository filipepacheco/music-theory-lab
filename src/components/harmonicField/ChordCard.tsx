import { memo } from "react";
import type { HarmonicFunction } from "@/constants/harmonicFields";
import Badge from "@/components/shared/Badge";
import { FUNCTION_COLORS } from "@/constants/functionColors";

interface ChordCardProps {
  romanNumeral: string;
  chordName: string;
  harmonicFunction: HarmonicFunction;
  noteNames: string[];
  intervals: number[];
  isSelected: boolean;
  onClick: () => void;
}

const ChordCard = memo(function ChordCard({
  romanNumeral,
  chordName,
  harmonicFunction,
  noteNames,
  isSelected,
  onClick,
}: ChordCardProps) {
  const functionColor = FUNCTION_COLORS[harmonicFunction];

  return (
    <button
      onClick={onClick}
      aria-label={`${romanNumeral} - ${chordName}`}
      aria-pressed={isSelected}
      className={`flex flex-col items-center gap-1.5 sm:gap-2 py-3 px-2.5 sm:p-4 bg-bg-card border cursor-pointer min-w-20 sm:min-w-[100px] shrink-0 sm:shrink sm:flex-1 active:translate-x-px active:translate-y-px ${
        isSelected ? "" : "border-border-default hover:border-accent hover:shadow-lift"
      }`}
      style={
        // The chosen chord lifts on a hard shadow in its function colour.
        isSelected
          ? {
              borderColor: functionColor,
              boxShadow: `4px 4px 0 0 ${functionColor}`,
            }
          : undefined
      }
    >
      {/* Roman numeral */}
      <span className="text-title leading-none text-text-primary">
        {romanNumeral}
      </span>

      {/* Chord name */}
      <span className="text-meta sm:text-ui text-text-secondary">
        {chordName}
      </span>

      {/* Function badge */}
      <Badge harmonicFunction={harmonicFunction} />

      {/* Notes */}
      <div className="flex gap-1 flex-wrap justify-center">
        {noteNames.map((n, i) => (
          <span
            key={i}
            className="text-micro text-text-primary px-1 sm:px-2 py-0.5 bg-bg-tertiary border border-border-default"
          >
            {n}
          </span>
        ))}
      </div>
    </button>
  );
});

export default ChordCard;
