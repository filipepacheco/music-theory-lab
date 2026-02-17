import { useQuiz } from "@/hooks/useQuiz";
import type { QuizMode } from "@/utils/quizGenerator";
import IntervalQuiz from "./IntervalQuiz";
import ChordTypeQuiz from "./ChordTypeQuiz";
import DegreeQuiz from "./DegreeQuiz";
import ChordIdQuiz from "./ChordIdQuiz";

const QUIZ_MODES: { id: QuizMode; label: string; description: string }[] = [
  {
    id: "interval",
    label: "Intervalos",
    description: "Identifique o intervalo entre duas notas",
  },
  {
    id: "chordType",
    label: "Tipo de Acorde",
    description: "Identifique o tipo de acorde tocado",
  },
  {
    id: "degree",
    label: "Grau no Campo",
    description: "Identifique o grau no campo harmonico",
  },
  {
    id: "chordId",
    label: "Identificar Acorde",
    description: "Identifique o acorde completo (nota + tipo)",
  },
];

export default function QuizModule() {
  const quiz = useQuiz();

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="font-heading text-lg text-text-primary mb-4">
          Quiz Auditivo
        </h2>

        {/* Mode selector */}
        <div className="section-panel flex flex-col gap-4">
          <div className="flex gap-2 flex-wrap">
            {QUIZ_MODES.map((qm) => (
              <button
                key={qm.id}
                onClick={() => quiz.changeMode(qm.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer border ${
                  quiz.mode === qm.id
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border-default bg-bg-card text-text-secondary hover:text-text-primary hover:border-accent/30"
                }`}
              >
                {qm.label}
              </button>
            ))}
          </div>

          {/* Active quiz */}
          {quiz.mode === "interval" && <IntervalQuiz quiz={quiz} />}
          {quiz.mode === "chordType" && <ChordTypeQuiz quiz={quiz} />}
          {quiz.mode === "degree" && <DegreeQuiz quiz={quiz} />}
          {quiz.mode === "chordId" && <ChordIdQuiz quiz={quiz} />}
        </div>
      </div>
    </section>
  );
}
