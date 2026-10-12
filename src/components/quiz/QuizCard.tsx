import { motion, AnimatePresence } from "framer-motion";
import QuizOptions from "./QuizOptions";
import type { QuizQuestion } from "@/utils/quizGenerator";
import Button from "@/components/shared/Button";
import Callout from "@/components/shared/Callout";

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-sm text-text-secondary">{prompt}</p>
        <Button onClick={onReplay} className="shrink-0 self-start">
          Ouvir novamente
        </Button>
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
            <Callout
              tone={isCorrect ? "success" : "danger"}
              title={isCorrect ? "Correto!" : "Incorreto."}
              className="my-0"
            >
              {!isCorrect && <p>Resposta: {question.correctAnswer}</p>}
              {tip && <p className="text-text-muted">{tip}</p>}
            </Callout>

            <Button variant="primary" onClick={onNext}>
              Próxima pergunta
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
