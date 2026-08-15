import { useQuiz } from '@/hooks/useQuiz';
import { QUIZ_MODE_CONFIGS } from './quizModes';
import QuizModeView from './QuizModeView';

const QUIZ_MODES = Object.entries(QUIZ_MODE_CONFIGS).map(([id, config]) => ({
  id: id as keyof typeof QUIZ_MODE_CONFIGS,
  label: config.label,
  description: config.modeDescription,
}));

export default function QuizModule() {
  const quiz = useQuiz();
  const activeConfig = QUIZ_MODE_CONFIGS[quiz.mode];

  return (
    <section className="flex flex-col gap-4 sm:gap-6">
      <div>
        <h2 className="font-heading text-lg text-text-primary mb-4">
          Quiz Auditivo
        </h2>

        {/* Mode selector */}
        <div className="section-panel flex flex-col gap-4">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {QUIZ_MODES.map((qm) => (
              <button
                key={qm.id}
                onClick={() => quiz.changeMode(qm.id)}
                className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer border shrink-0 ${
                  quiz.mode === qm.id
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border-default bg-bg-card text-text-secondary hover:text-text-primary hover:border-accent/30'
                }`}
              >
                {qm.label}
              </button>
            ))}
          </div>

          {/* Active quiz */}
          <QuizModeView quiz={quiz} config={activeConfig} />
        </div>
      </div>
    </section>
  );
}
