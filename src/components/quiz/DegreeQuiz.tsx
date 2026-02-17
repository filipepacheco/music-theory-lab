import { DEGREE_TIPS, DEGREE_TIPS_MINOR } from "@/constants/quizData";
import { useQuiz } from "@/hooks/useQuiz";
import { useAppStore } from "@/store/useAppStore";
import { getNoteName } from "@/utils/noteHelpers";
import QuizCard from "./QuizCard";
import ScoreBoard from "./ScoreBoard";

interface DegreeQuizProps {
  quiz: ReturnType<typeof useQuiz>;
}

export default function DegreeQuiz({ quiz }: DegreeQuizProps) {
  const { question, selectedAnswer, isCorrect, showingResult, score } = quiz;
  const rootNote = useAppStore((s) => s.rootNote);
  const isMinor = useAppStore((s) => s.isMinor);
  const rootName = getNoteName(rootNote);

  const tips = isMinor ? DEGREE_TIPS_MINOR : DEGREE_TIPS;
  const tip =
    showingResult && question
      ? (tips[question.tipKey as number] ?? null)
      : null;

  const modeName = isMinor ? "menor" : "maior";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-text-muted">
          Um acorde do campo harmonico de {rootName} {modeName} sera tocado.
          Identifique o grau.
        </p>
        <ScoreBoard score={score} onReset={quiz.resetScore} />
      </div>

      {!question ? (
        <div className="text-center py-8">
          <p className="text-sm text-text-secondary mb-4">
            O I grau (tonica) sera tocado primeiro como referencia.
          </p>
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
          prompt={`Qual grau de ${rootName} ${modeName}?`}
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
