import type { QuizScore } from "@/hooks/useQuiz";
import Button from "@/components/shared/Button";

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
          <span className="lh-label">Acertos</span>
        </div>

        {score.total > 0 && (
          <div className="flex flex-col items-center">
            <span
              className={`text-lg font-heading ${pct >= 70 ? "text-success" : pct >= 40 ? "text-warning" : "text-danger"}`}
            >
              {pct}%
            </span>
            <span className="lh-label">Taxa</span>
          </div>
        )}

        <div className="flex flex-col items-center">
          <span className="text-base sm:text-lg font-heading text-accent">
            {score.streak}
          </span>
          <span className="lh-label">Sequência</span>
        </div>

        {score.bestStreak > 0 && (
          <div className="flex flex-col items-center">
            <span className="text-base sm:text-lg font-heading text-text-secondary">
              {score.bestStreak}
            </span>
            <span className="lh-label">Melhor</span>
          </div>
        )}
      </div>

      {score.total > 0 && (
        <Button size="sm" onClick={onReset}>
          Resetar
        </Button>
      )}
    </div>
  );
}
