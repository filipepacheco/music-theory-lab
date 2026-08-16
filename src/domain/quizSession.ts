import type { QuizMode, QuizQuestion } from '@/utils/quizGenerator';

export interface QuizScore {
  correct: number;
  total: number;
  streak: number;
  bestStreak: number;
}

export interface QuizSessionState {
  mode: QuizMode;
  question: QuizQuestion | null;
  selectedAnswer: string | null;
  isCorrect: boolean | null;
  score: QuizScore;
  showingResult: boolean;
  keyLimited: boolean;
}

export type QuizSessionAction =
  | { type: 'questionGenerated'; question: QuizQuestion }
  | { type: 'answer'; selectedAnswer: string }
  | { type: 'changeMode'; mode: QuizMode }
  | { type: 'resetScore' }
  | { type: 'toggleKeyLimited' };

export const createInitialQuizSessionState = (): QuizSessionState => ({
  mode: 'interval',
  question: null,
  selectedAnswer: null,
  isCorrect: null,
  score: { correct: 0, total: 0, streak: 0, bestStreak: 0 },
  showingResult: false,
  keyLimited: false,
});

export function quizSessionReducer(
  state: QuizSessionState,
  action: QuizSessionAction,
): QuizSessionState {
  switch (action.type) {
    case 'questionGenerated':
      return {
        ...state,
        question: action.question,
        selectedAnswer: null,
        isCorrect: null,
        showingResult: false,
      };

    case 'answer': {
      if (!state.question || state.showingResult) return state;
      const isCorrect = action.selectedAnswer === state.question.correctAnswer;
      const streak = isCorrect ? state.score.streak + 1 : 0;
      return {
        ...state,
        selectedAnswer: action.selectedAnswer,
        isCorrect,
        showingResult: true,
        score: {
          correct: state.score.correct + (isCorrect ? 1 : 0),
          total: state.score.total + 1,
          streak,
          bestStreak: Math.max(state.score.bestStreak, streak),
        },
      };
    }

    case 'changeMode':
      return {
        ...state,
        mode: action.mode,
        question: null,
        selectedAnswer: null,
        isCorrect: null,
        showingResult: false,
        score: createInitialQuizSessionState().score,
      };

    case 'resetScore':
      return { ...state, score: createInitialQuizSessionState().score };

    case 'toggleKeyLimited':
      return {
        ...state,
        keyLimited: !state.keyLimited,
        question: null,
        selectedAnswer: null,
        isCorrect: null,
        showingResult: false,
        score: createInitialQuizSessionState().score,
      };
  }
}
