import { useState, useCallback, useEffect, useRef } from 'react';
import { useSynth } from '@/hooks/useSynth';
import { useAppStore } from '@/store/useAppStore';
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

export interface QuizScore {
  correct: number;
  total: number;
  streak: number;
  bestStreak: number;
}

export interface QuizState {
  mode: QuizMode;
  question: QuizQuestion | null;
  selectedAnswer: string | null;
  isCorrect: boolean | null;
  score: QuizScore;
  showingResult: boolean;
}

const INITIAL_SCORE: QuizScore = {
  correct: 0,
  total: 0,
  streak: 0,
  bestStreak: 0,
};

export function useQuiz() {
  const [mode, setMode] = useState<QuizMode>('interval');
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showingResult, setShowingResult] = useState(false);
  const [score, setScore] = useState<QuizScore>(INITIAL_SCORE);
  const [keyLimited, setKeyLimited] = useState(false);

  const { playNote, playChord } = useSynth();
  const rootNote = useAppStore((s) => s.rootNote);
  const isMinor = useAppStore((s) => s.isMinor);
  const selectChord = useAppStore((s) => s.selectChord);
  const setHighlightedNotes = useAppStore((s) => s.setHighlightedNotes);

  // Pending playback timers. Cleared on mode change / key toggle so stale
  // audio from a dead question never fires.
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
        // Play notes one by one (intervals), ascending: the shared voicing
        // rule bumps the second note an octave when it wraps around.
        const voiced = ascendVoicing(q.notes, q.octave);
        playNote(voiced[0].note, voiced[0].octave);
        schedule(() => playNote(voiced[1].note, voiced[1].octave), 500);
      } else {
        // Play all notes at once (chords)
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
    setQuestion(q);
    setSelectedAnswer(null);
    setIsCorrect(null);
    setShowingResult(false);
    selectChord(null);

    // Auto-play with a small delay for UI to update
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
      // Play tonic first as reference
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
      setSelectedAnswer(selected);
      setIsCorrect(correct);
      setShowingResult(true);

      setScore((prev) => {
        const newStreak = correct ? prev.streak + 1 : 0;
        return {
          correct: prev.correct + (correct ? 1 : 0),
          total: prev.total + 1,
          streak: newStreak,
          bestStreak: Math.max(prev.bestStreak, newStreak),
        };
      });

      // If wrong, replay the correct answer after a short delay — the same
      // playback path, so the two can't drift.
      if (!correct) {
        schedule(() => playQuestion(question), 800);
      }
    },
    [question, showingResult, playQuestion, schedule],
  );

  const changeMode = useCallback(
    (newMode: QuizMode) => {
      cancelPending();
      setMode(newMode);
      setQuestion(null);
      setSelectedAnswer(null);
      setIsCorrect(null);
      setShowingResult(false);
      setScore(INITIAL_SCORE);
      selectChord(null);
    },
    [selectChord, cancelPending],
  );

  const resetScore = useCallback(() => {
    setScore(INITIAL_SCORE);
  }, []);

  const toggleKeyLimited = useCallback(() => {
    cancelPending();
    setKeyLimited((prev) => !prev);
    setQuestion(null);
    setSelectedAnswer(null);
    setIsCorrect(null);
    setShowingResult(false);
    setScore(INITIAL_SCORE);
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
