import { motion } from "framer-motion";

interface QuizOptionsProps {
  options: string[];
  selectedAnswer: string | null;
  correctAnswer: string;
  showingResult: boolean;
  onSelect: (option: string) => void;
}

export default function QuizOptions({
  options,
  selectedAnswer,
  correctAnswer,
  showingResult,
  onSelect,
}: QuizOptionsProps) {
  return (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Opcoes de resposta">
      {options.map((option) => {
        let style = "border-border-default bg-bg-card hover:border-accent/50";

        if (showingResult) {
          if (option === correctAnswer) {
            style =
              "border-green-500 bg-green-500/15 text-green-400";
          } else if (option === selectedAnswer && option !== correctAnswer) {
            style =
              "border-red-500 bg-red-500/15 text-red-400";
          } else {
            style = "border-border-default bg-bg-card opacity-50";
          }
        }

        return (
          <motion.button
            key={option}
            whileHover={showingResult ? {} : { scale: 1.02 }}
            whileTap={showingResult ? {} : { scale: 0.97 }}
            onClick={() => onSelect(option)}
            disabled={showingResult}
            aria-label={option}
            className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all cursor-pointer disabled:cursor-default ${style}`}
          >
            {showingResult && option === correctAnswer && (
              <span className="mr-1.5" aria-hidden="true">&#10003;</span>
            )}
            {showingResult && option === selectedAnswer && option !== correctAnswer && (
              <span className="mr-1.5" aria-hidden="true">&#10007;</span>
            )}
            {option}
          </motion.button>
        );
      })}
    </div>
  );
}
