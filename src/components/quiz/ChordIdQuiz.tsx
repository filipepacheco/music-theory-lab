import { CHORD_ID_TIPS } from '@/constants/quizData';
import { useQuiz } from '@/hooks/useQuiz';
import { useAppStore } from '@/store/useAppStore';
import { getNoteName } from '@/utils/noteHelpers';
import QuizCard from './QuizCard';
import ScoreBoard from './ScoreBoard';

interface ChordIdQuizProps {
  quiz: ReturnType<typeof useQuiz>;
}

export default function ChordIdQuiz({ quiz }: ChordIdQuizProps) {
  const { question, selectedAnswer, isCorrect, showingResult, score, keyLimited } = quiz;
  const rootNote = useAppStore((s) => s.rootNote);
  const isMinor = useAppStore((s) => s.isMinor);

  const tip =
    showingResult && question
      ? (CHORD_ID_TIPS[question.tipKey as string] ?? null)
      : null;

  const keyLabel = `${getNoteName(rootNote)} ${isMinor ? "menor" : "maior"}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <p className="text-xs text-text-muted">
            {keyLimited
              ? `Acordes do campo de ${keyLabel}.`
              : "Acorde aleatorio. Identifique nota + tipo."}
          </p>
          <button
            onClick={quiz.toggleKeyLimited}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer border ${
              keyLimited
                ? "border-accent bg-accent/15 text-accent"
                : "border-border-default bg-bg-card text-text-muted hover:text-text-secondary hover:border-accent/30"
            }`}
          >
            {keyLimited ? `Tom: ${keyLabel}` : "Limitar ao tom"}
          </button>
        </div>
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
          prompt="Qual acorde voce ouviu?"
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
