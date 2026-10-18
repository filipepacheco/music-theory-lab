import { useQuiz } from '@/hooks/useQuiz';
import { QUIZ_MODE_CONFIGS } from './quizModes';
import QuizModeView from './QuizModeView';
import Frame from '@/components/shared/Frame';
import Segmented from '@/components/shared/Segmented';

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
      <Frame title="Quiz Auditivo" titleAs="h2" className="flex flex-col gap-4">
        <div className="overflow-x-auto scrollbar-none">
          <Segmented
            label="Tipo de exercício"
            className="w-max"
            value={quiz.mode}
            onChange={quiz.changeMode}
            options={QUIZ_MODES.map((qm) => ({
              value: qm.id,
              label: qm.label,
            }))}
          />
        </div>

        <QuizModeView quiz={quiz} config={activeConfig} />
      </Frame>
    </section>
  );
}
