import { motion, AnimatePresence } from "framer-motion";
import QuizOptions from "./QuizOptions";
import type { QuizQuestion } from "@/utils/quizGenerator";

interface QuizCardProps {
  question: QuizQuestion;
  prompt: string;
  selectedAnswer: string | null;
  isCorrect: boolean | null;
  showingResult: boolean;
  tip: string | null;
  onAnswer: (option: string) => void;
  onNext: () => void;
  onReplay: () => void;
}

export default function QuizCard({
  question,
  prompt,
  selectedAnswer,
  isCorrect,
  showingResult,
  tip,
  onAnswer,
  onNext,
  onReplay,
}: QuizCardProps) {
  return (
    <div className="space-y-4">
      {/* Prompt */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">{prompt}</p>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onReplay}
          className="px-3 py-2 rounded-md text-sm bg-bg-tertiary text-text-secondary hover:text-text-primary border border-border-default transition-colors cursor-pointer"
        >
          Ouvir novamente
        </motion.button>
      </div>

      {/* Options */}
      <QuizOptions
        options={question.options}
        selectedAnswer={selectedAnswer}
        correctAnswer={question.correctAnswer}
        showingResult={showingResult}
        onSelect={onAnswer}
      />

      {/* Result feedback */}
      <AnimatePresence>
        {showingResult && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-3"
          >
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
                isCorrect
                  ? "bg-green-500/10 text-green-400 border border-green-500/30"
                  : "bg-red-500/10 text-red-400 border border-red-500/30"
              }`}
            >
              <span>{isCorrect ? "Correto!" : "Incorreto."}</span>
              {!isCorrect && (
                <span className="text-text-secondary">
                  Resposta: {question.correctAnswer}
                </span>
              )}
            </div>

            {tip && (
              <p className="text-sm text-text-secondary leading-relaxed border-l-2 border-accent/40 pl-3">
                {tip}
              </p>
            )}

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={onNext}
              className="px-6 py-2.5 rounded-lg text-sm font-semibold bg-accent text-white shadow-[0_0_16px_rgba(79,110,247,0.3)] cursor-pointer"
            >
              Proxima pergunta
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
