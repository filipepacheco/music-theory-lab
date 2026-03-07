import type { QuizScore } from "@/hooks/useQuiz";

interface ScoreBoardProps {
  score: QuizScore;
  onReset: () => void;
}

export default function ScoreBoard({ score, onReset }: ScoreBoardProps) {
  const pct =
    score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;

  return (
    <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex flex-col items-center">
          <span className="text-base sm:text-lg font-heading text-text-primary">
            {score.correct}/{score.total}
          </span>
          <span className="text-[10px] text-text-muted">Acertos</span>
        </div>

        {score.total > 0 && (
          <div className="flex flex-col items-center">
            <span
              className={`text-lg font-heading ${pct >= 70 ? "text-subdominant" : pct >= 40 ? "text-dominant" : "text-red-400"}`}
            >
              {pct}%
            </span>
            <span className="text-[10px] text-text-muted">Taxa</span>
          </div>
        )}

        <div className="flex flex-col items-center">
          <span className="text-base sm:text-lg font-heading text-accent">
            {score.streak}
          </span>
          <span className="text-[10px] text-text-muted">Sequencia</span>
        </div>

        {score.bestStreak > 0 && (
          <div className="flex flex-col items-center">
            <span className="text-base sm:text-lg font-heading text-text-secondary">
              {score.bestStreak}
            </span>
            <span className="text-[10px] text-text-muted">Melhor</span>
          </div>
        )}
      </div>

      {score.total > 0 && (
        <button
          onClick={onReset}
          className="text-[10px] text-text-muted hover:text-text-primary transition-colors cursor-pointer"
        >
          Resetar
        </button>
      )}
    </div>
  );
}
