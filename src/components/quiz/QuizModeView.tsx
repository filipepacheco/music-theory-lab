import { useQuiz } from '@/hooks/useQuiz';
import { useAppStore } from '@/store/useAppStore';
import { getPreferredRootName } from '@/utils/noteHelpers';
import QuizCard from './QuizCard';
import ScoreBoard from './ScoreBoard';
import type { QuizModeConfig } from './quizModes';

interface QuizModeViewProps {
  quiz: ReturnType<typeof useQuiz>;
  config: QuizModeConfig;
}

export default function QuizModeView({ quiz, config }: QuizModeViewProps) {
  const {
    question,
    selectedAnswer,
    isCorrect,
    showingResult,
    score,
    keyLimited,
  } = quiz;
  const rootNote = useAppStore((s) => s.rootNote);
  const isMinor = useAppStore((s) => s.isMinor);

  const keyLabel = `${getPreferredRootName(rootNote)} ${isMinor ? 'menor' : 'maior'}`;
  const ctx = { keyLabel, keyLimited, isMinor };

  const tips = config.tipsFor(ctx);
  const tip =
    showingResult && question
      ? ((config.tipKeyIsNumber
          ? tips[question.tipKey as number]
          : tips[question.tipKey as string]) ?? null)
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        {config.showKeyToggle ? (
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <p className="text-xs text-text-muted">{config.description(ctx)}</p>
            <button
              onClick={quiz.toggleKeyLimited}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer border ${
                keyLimited
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-border-default bg-bg-card text-text-muted hover:text-text-secondary hover:border-accent/30'
              }`}
            >
              {keyLimited ? `Tom: ${keyLabel}` : 'Limitar ao tom'}
            </button>
          </div>
        ) : (
          <p className="text-xs text-text-muted">{config.description(ctx)}</p>
        )}
        <ScoreBoard score={score} onReset={quiz.resetScore} />
      </div>

      {!question ? (
        <div className="text-center py-8">
          {config.startHint && (
            <p className="text-sm text-text-secondary mb-4">
              {config.startHint}
            </p>
          )}
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
          prompt={config.prompt(ctx)}
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
