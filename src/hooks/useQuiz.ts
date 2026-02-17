import { useState, useCallback } from "react";
import { useSynth } from "@/hooks/useSynth";
import { useAppStore } from "@/store/useAppStore";
import { getPreferredRootName, computeVoicingOctaveMap } from "@/utils/noteHelpers";
import {
  generateQuestion,
  type QuizMode,
  type QuizQuestion,
  type ChordIdKeyContext,
} from "@/utils/quizGenerator";

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
  const [mode, setMode] = useState<QuizMode>("interval");
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showingResult, setShowingResult] = useState(false);
  const [score, setScore] = useState<QuizScore>(INITIAL_SCORE);
  const [keyLimited, setKeyLimited] = useState(false);

  const { playNote, playChord } = useSynth();
  const isMinor = useAppStore((s) => s.isMinor);
  const rootNote = useAppStore((s) => s.rootNote);
  const harmonicField = useAppStore((s) => s.harmonicField);
  const selectChord = useAppStore((s) => s.selectChord);
  const setHighlightedNotes = useAppStore((s) => s.setHighlightedNotes);

  const playQuestion = useCallback(
    (q: QuizQuestion) => {
      if (q.type === "degree") {
        // Resolve notes from harmonic field
        const degree = q.tipKey as number;
        const chord = harmonicField[degree];
        if (chord) {
          playChord(chord.notes, q.octave);
          selectChord(degree);
        }
        return;
      }

      if (q.sequential) {
        // Play notes one by one (intervals)
        // If second note wraps around (mod 12), play it an octave higher
        // so ascending intervals always sound ascending
        const secondOctave =
          q.notes[1] <= q.notes[0] ? q.octave + 1 : q.octave;
        playNote(q.notes[0], q.octave);
        setTimeout(() => {
          playNote(q.notes[1], secondOctave);
        }, 500);
      } else {
        // Play all notes at once (chords)
        playChord(q.notes, q.octave);
        const chordRootName = getPreferredRootName(q.notes[0]);
        const octaveMap = computeVoicingOctaveMap(q.notes, q.octave);
        setHighlightedNotes(q.notes, "var(--color-accent)", chordRootName, octaveMap);
      }
    },
    [harmonicField, playNote, playChord, selectChord, setHighlightedNotes],
  );

  const newQuestion = useCallback(() => {
    const chordIdKeyContext: ChordIdKeyContext | undefined =
      mode === "chordId" && keyLimited
        ? { rootNote, isMinor }
        : undefined;
    const q = generateQuestion(mode, isMinor, chordIdKeyContext);
    setQuestion(q);
    setSelectedAnswer(null);
    setIsCorrect(null);
    setShowingResult(false);
    selectChord(null);

    // Auto-play with a small delay for UI to update
    setTimeout(() => playQuestion(q), 300);
  }, [mode, isMinor, rootNote, keyLimited, playQuestion, selectChord]);

  const replayQuestion = useCallback(() => {
    if (question) {
      // For degree quiz, play tonic first as reference
      if (question.type === "degree") {
        const tonic = harmonicField[0];
        if (tonic) {
          playChord(tonic.notes, question.octave);
          selectChord(0);
          setTimeout(() => {
            playQuestion(question);
          }, 1200);
        }
      } else {
        playQuestion(question);
      }
    }
  }, [question, harmonicField, playChord, selectChord, playQuestion]);

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

      // If wrong, replay the correct answer after a short delay
      if (!correct && question.type !== "degree") {
        setTimeout(() => {
          if (question.sequential) {
            const secondOctave =
              question.notes[1] <= question.notes[0]
                ? question.octave + 1
                : question.octave;
            playNote(question.notes[0], question.octave);
            setTimeout(() => {
              playNote(question.notes[1], secondOctave);
            }, 500);
          } else {
            playChord(question.notes, question.octave);
          }
        }, 800);
      }
    },
    [question, showingResult, playNote, playChord],
  );

  const changeMode = useCallback(
    (newMode: QuizMode) => {
      setMode(newMode);
      setQuestion(null);
      setSelectedAnswer(null);
      setIsCorrect(null);
      setShowingResult(false);
      setScore(INITIAL_SCORE);
      selectChord(null);
    },
    [selectChord],
  );

  const resetScore = useCallback(() => {
    setScore(INITIAL_SCORE);
  }, []);

  const toggleKeyLimited = useCallback(() => {
    setKeyLimited((prev) => !prev);
    setQuestion(null);
    setSelectedAnswer(null);
    setIsCorrect(null);
    setShowingResult(false);
    setScore(INITIAL_SCORE);
  }, []);

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
