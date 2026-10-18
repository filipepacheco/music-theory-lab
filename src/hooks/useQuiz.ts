import { useReducer, useCallback, useEffect, useRef } from 'react';
import { useSynth } from '@/hooks/useSynth';
import { useAppStore } from '@/store/useAppStore';
import {
  createInitialQuizSessionState,
  quizSessionReducer,
} from '@/domain/quizSession';
import type { QuizSessionState } from '@/domain/quizSession';
import {
  getPreferredRootName,
  computeVoicingOctaveMap,
  ascendVoicing,
} from '@/utils/noteHelpers';
import {
  generateQuestion,
  type QuizMode,
  type QuizQuestion,
} from '@/utils/quizGenerator';

export type { QuizScore } from '@/domain/quizSession';
export type QuizState = QuizSessionState;

export function useQuiz() {
  const [session, dispatch] = useReducer(
    quizSessionReducer,
    undefined,
    createInitialQuizSessionState,
  );
  const {
    mode,
    question,
    selectedAnswer,
    isCorrect,
    score,
    showingResult,
    keyLimited,
  } = session;

  const { playNote, playChord } = useSynth();
  const rootNote = useAppStore((s) => s.rootNote);
  const isMinor = useAppStore((s) => s.isMinor);
  const selectChord = useAppStore((s) => s.selectChord);
  const setHighlightedNotes = useAppStore((s) => s.setHighlightedNotes);

  const timersRef = useRef<number[]>([]);
  const schedule = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);
  const cancelPending = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  }, []);

  useEffect(() => cancelPending, [cancelPending]);

  const playQuestion = useCallback(
    (q: QuizQuestion) => {
      if (q.type === 'degree') {
        const degree = q.tipKey as number;
        playChord(q.notes, q.octave);
        selectChord(degree);
        return;
      }

      if (q.sequential) {
        const voiced = ascendVoicing(q.notes, q.octave);
        playNote(voiced[0].note, voiced[0].octave);
        schedule(() => playNote(voiced[1].note, voiced[1].octave), 500);
      } else {
        playChord(q.notes, q.octave);
        const chordRootName = getPreferredRootName(q.notes[0]);
        const octaveMap = computeVoicingOctaveMap(q.notes, q.octave);
        setHighlightedNotes(
          q.notes,
          'var(--color-accent)',
          chordRootName,
          octaveMap,
        );
      }
    },
    [playNote, playChord, selectChord, setHighlightedNotes, schedule],
  );

  const newQuestion = useCallback(() => {
    cancelPending();
    const q = generateQuestion(
      mode,
      { rootNote, isMinor },
      { limitToKey: keyLimited },
    );
    dispatch({ type: 'questionGenerated', question: q });
    selectChord(null);

    schedule(() => playQuestion(q), 300);
  }, [
    mode,
    rootNote,
    isMinor,
    keyLimited,
    playQuestion,
    selectChord,
    schedule,
    cancelPending,
  ]);

  const replayQuestion = useCallback(() => {
    if (!question) return;
    cancelPending();
    if (question.type === 'degree' && question.referenceNotes) {
      playChord(question.referenceNotes, question.octave);
      selectChord(0);
      schedule(() => playQuestion(question), 1200);
    } else {
      playQuestion(question);
    }
  }, [question, playChord, selectChord, playQuestion, schedule, cancelPending]);

  const answer = useCallback(
    (selected: string) => {
      if (!question || showingResult) return;

      const correct = selected === question.correctAnswer;
      dispatch({ type: 'answer', selectedAnswer: selected });

      if (!correct) {
        schedule(() => playQuestion(question), 800);
      }
    },
    [question, showingResult, playQuestion, schedule],
  );

  const changeMode = useCallback(
    (newMode: QuizMode) => {
      cancelPending();
      dispatch({ type: 'changeMode', mode: newMode });
      selectChord(null);
    },
    [selectChord, cancelPending],
  );

  const resetScore = useCallback(() => {
    dispatch({ type: 'resetScore' });
  }, []);

  const toggleKeyLimited = useCallback(() => {
    cancelPending();
    dispatch({ type: 'toggleKeyLimited' });
  }, [cancelPending]);

  return {
    mode,
    question,
    selectedAnswer,
    isCorrect,
    score,
    showingResult,
    keyLimited,
    newQuestion,
    replayQuestion,
    answer,
    changeMode,
    resetScore,
    toggleKeyLimited,
  };
}
