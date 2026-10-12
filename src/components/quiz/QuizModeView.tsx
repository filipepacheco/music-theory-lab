import { useQuiz } from '@/hooks/useQuiz';
import { useAppStore } from '@/store/useAppStore';
import { getPreferredRootName } from '@/utils/noteHelpers';
import QuizCard from './QuizCard';
import ScoreBoard from './ScoreBoard';
import Button from '@/components/shared/Button';
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
            <Button
              size="sm"
              pressed={keyLimited}
              onClick={quiz.toggleKeyLimited}
            >
              {keyLimited ? `Tom: ${keyLabel}` : 'Limitar ao tom'}
            </Button>
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
          <Button variant="primary" onClick={quiz.newQuestion}>
            Começar
          </Button>
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
