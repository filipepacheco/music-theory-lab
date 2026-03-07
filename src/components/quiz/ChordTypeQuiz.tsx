import { CHORD_TYPE_TIPS } from "@/constants/quizData";
import { useQuiz } from "@/hooks/useQuiz";
import QuizCard from "./QuizCard";
import ScoreBoard from "./ScoreBoard";

interface ChordTypeQuizProps {
  quiz: ReturnType<typeof useQuiz>;
}

export default function ChordTypeQuiz({ quiz }: ChordTypeQuizProps) {
  const { question, selectedAnswer, isCorrect, showingResult, score } = quiz;

  const tip =
    showingResult && question
      ? (CHORD_TYPE_TIPS[question.tipKey as string] ?? null)
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-xs text-text-muted">
          Um acorde sera tocado. Identifique o tipo (maior, menor, diminuto,
          etc.).
        </p>
        <ScoreBoard score={score} onReset={quiz.resetScore} />
      </div>

      {!question ? (
        <div className="text-center py-8">
          <button
            onClick={quiz.newQuestion}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold bg-accent text-white shadow-[0_0_16px_rgba(79,110,247,0.3)] cursor-pointer"
          >
            Comecar
          </button>
        </div>
      ) : (
        <QuizCard
          question={question}
          prompt="Que tipo de acorde voce ouviu?"
          selectedAnswer={selectedAnswer}
          isCorrect={isCorrect}
          showingResult={showingResult}
          tip={tip}
          onAnswer={quiz.answer}
          onNext={quiz.newQuestion}
          onReplay={quiz.replayQuestion}
        />
      )}
    </div>
  );
}
