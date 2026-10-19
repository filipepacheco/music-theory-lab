interface QuizOptionsProps {
  options: string[];
  selectedAnswer: string | null;
  correctAnswer: string;
  showingResult: boolean;
  onSelect: (option: string) => void;
}

export default function QuizOptions({
  options,
  selectedAnswer,
  correctAnswer,
  showingResult,
  onSelect,
}: QuizOptionsProps) {
  return (
    <div
      className="grid grid-cols-2 gap-2"
      role="group"
      aria-label="Opções de resposta"
    >
      {options.map((option) => {
        const isRight = showingResult && option === correctAnswer;
        const isWrong = showingResult && option === selectedAnswer && !isRight;

        let style =
          'border-border-default bg-bg-card hover:border-border-strong hover:bg-bg-tertiary';
        let mark = '( )';
        if (isRight) {
          style = 'border-success text-success';
          mark = '(\u2713)';
        } else if (isWrong) {
          style = 'border-danger text-danger';
          mark = '(x)';
        } else if (showingResult) {
          style = 'border-border-default bg-bg-card opacity-50';
        }

        return (
          <button
            key={option}
            onClick={() => onSelect(option)}
            disabled={showingResult}
            aria-label={option}
            className={`flex items-center gap-[1ch] px-[1.5ch] py-3 border text-left text-ui cursor-pointer disabled:cursor-default ${style}`}
          >
            <span
              aria-hidden="true"
              className={isRight || isWrong ? '' : 'text-text-muted'}
            >
              {mark}
            </span>
            {option}
          </button>
        );
      })}
    </div>
  );
}
