import { INTERVAL_TIPS } from "@/constants/quizData";
import { useQuiz } from "@/hooks/useQuiz";
import QuizCard from "./QuizCard";
import ScoreBoard from "./ScoreBoard";

interface IntervalQuizProps {
  quiz: ReturnType<typeof useQuiz>;
}

export default function IntervalQuiz({ quiz }: IntervalQuizProps) {
  const { question, selectedAnswer, isCorrect, showingResult, score } = quiz;

  const tip =
    showingResult && question
      ? (INTERVAL_TIPS[question.tipKey as number] ?? null)
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-text-muted">
          Duas notas serao tocadas em sequencia. Identifique o intervalo entre
          elas.
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
          prompt="Qual intervalo voce ouviu?"
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
