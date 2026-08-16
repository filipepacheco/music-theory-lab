import { describe, expect, it } from 'vitest';
import {
  createInitialQuizSessionState,
  quizSessionReducer,
} from './quizSession';
import type { QuizQuestion } from '@/utils/quizGenerator';

const question: QuizQuestion = {
  type: 'interval',
  notes: [0, 7],
  octave: 4,
  sequential: true,
  correctAnswer: 'quinta justa',
  options: ['quinta justa', 'terça maior'],
  tipKey: 7,
};

describe('quiz session', () => {
  it('scores a correct answer and advances the streak', () => {
    const started = quizSessionReducer(createInitialQuizSessionState(), {
      type: 'questionGenerated',
      question,
    });

    const answered = quizSessionReducer(started, {
      type: 'answer',
      selectedAnswer: 'quinta justa',
    });

    expect(answered.isCorrect).toBe(true);
    expect(answered.score).toEqual({
      correct: 1,
      total: 1,
      streak: 1,
      bestStreak: 1,
    });
  });

  it('does not score a second answer after showing a result', () => {
    const started = quizSessionReducer(createInitialQuizSessionState(), {
      type: 'questionGenerated',
      question,
    });
    const answered = quizSessionReducer(started, {
      type: 'answer',
      selectedAnswer: 'terça maior',
    });

    const repeated = quizSessionReducer(answered, {
      type: 'answer',
      selectedAnswer: 'quinta justa',
    });

    expect(repeated).toEqual(answered);
  });

  it('clears the active question and score when the mode changes', () => {
    const state = quizSessionReducer(
      quizSessionReducer(createInitialQuizSessionState(), {
        type: 'questionGenerated',
        question,
      }),
      { type: 'answer', selectedAnswer: 'quinta justa' },
    );

    const changed = quizSessionReducer(state, {
      type: 'changeMode',
      mode: 'degree',
    });

    expect(changed.mode).toBe('degree');
    expect(changed.question).toBeNull();
    expect(changed.score.total).toBe(0);
  });
});
