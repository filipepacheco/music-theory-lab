import { CHORD_TYPES } from "@/constants/chords";
import { getPreferredRootName } from "@/utils/noteHelpers";
import { getHarmonicField } from "@/utils/musicTheory";
import {
  INTERVAL_NAMES,
  ROMAN_NUMERALS_MAJOR,
  ROMAN_NUMERALS_MINOR,
} from "@/constants/quizData";

export type QuizMode = "interval" | "chordType" | "degree" | "chordId";

export interface QuizQuestion {
  type: QuizMode;
  /** Note indices (0-11) to play */
  notes: number[];
  /** Octave for playback */
  octave: number;
  /** Whether notes are played sequentially (interval) or simultaneously (chord) */
  sequential: boolean;
  /** The correct answer label */
  correctAnswer: string;
  /** All answer options (shuffled, includes correct) */
  options: string[];
  /** Key for tips lookup */
  tipKey: string | number;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickDistractors(
  correct: string,
  all: string[],
  count: number,
): string[] {
  const others = all.filter((a) => a !== correct);
  return shuffle(others).slice(0, count);
}

export function generateIntervalQuestion(): QuizQuestion {
  const rootNote = randomInt(0, 11);
  // Exclude unison (0) for more interesting questions, include 1-12
  const semitones = randomInt(1, 12);
  const secondNote = (rootNote + semitones) % 12;

  const correct = INTERVAL_NAMES.find((i) => i.semitones === semitones)!;
  const allLabels = INTERVAL_NAMES.filter((i) => i.semitones > 0).map(
    (i) => i.label,
  );
  const distractors = pickDistractors(correct.label, allLabels, 3);
  const options = shuffle([correct.label, ...distractors]);

  return {
    type: "interval",
    notes: [rootNote, secondNote],
    octave: 4,
    sequential: true,
    correctAnswer: correct.label,
    options,
    tipKey: semitones,
  };
}

export function generateChordTypeQuestion(): QuizQuestion {
  const rootNote = randomInt(0, 11);
  // Quiz chord types: major, minor, dim, aug, maj7, min7, dom7
  const quizTypes = ["major", "minor", "dim", "aug", "maj7", "min7", "dom7"];
  const chosenId = quizTypes[randomInt(0, quizTypes.length - 1)];
  const chord = CHORD_TYPES[chosenId];

  const notes = chord.intervals.map((i) => (rootNote + i) % 12);
  const allLabels = quizTypes.map((id) => CHORD_TYPES[id].label);
  const distractors = pickDistractors(chord.label, allLabels, 3);
  const options = shuffle([chord.label, ...distractors]);

  return {
    type: "chordType",
    notes,
    octave: 3,
    sequential: false,
    correctAnswer: chord.label,
    options,
    tipKey: chosenId,
  };
}

export function generateDegreeQuestion(isMinor: boolean): QuizQuestion {
  const numerals = isMinor ? ROMAN_NUMERALS_MINOR : ROMAN_NUMERALS_MAJOR;
  // Pick a random degree (0-6)
  const degree = randomInt(0, 6);
  const correct = numerals[degree];
  const distractors = pickDistractors(correct, [...numerals], 3);
  const options = shuffle([correct, ...distractors]);

  return {
    type: "degree",
    notes: [], // Will be resolved from harmonicField at play time
    octave: 3,
    sequential: false,
    correctAnswer: correct,
    options,
    tipKey: degree,
  };
}

export interface ChordIdKeyContext {
  rootNote: number;
  isMinor: boolean;
}

export function generateChordIdQuestion(
  keyContext?: ChordIdKeyContext,
): QuizQuestion {
  if (keyContext) {
    return generateDiatonicChordIdQuestion(keyContext);
  }

  const quizTypes = ["major", "minor", "dom7", "maj7", "min7", "dim"];
  const rootNote = randomInt(0, 11);
  const chosenId = quizTypes[randomInt(0, quizTypes.length - 1)];
  const chord = CHORD_TYPES[chosenId];
  const notes = chord.intervals.map((i) => (rootNote + i) % 12);
  const rootName = getPreferredRootName(rootNote);
  const correctLabel = `${rootName}${chord.symbol || ""}`;

  // Build distractors that are plausible
  const distractors: string[] = [];
  const used = new Set<string>([correctLabel]);

  // 1. Same root, different type
  const otherTypes = quizTypes.filter((id) => id !== chosenId);
  const sameRootType = otherTypes[randomInt(0, otherTypes.length - 1)];
  const sameRootLabel = `${rootName}${CHORD_TYPES[sameRootType].symbol || ""}`;
  if (!used.has(sameRootLabel)) {
    distractors.push(sameRootLabel);
    used.add(sameRootLabel);
  }

  // 2. Same type, different root
  const nearbyRoots = [
    (rootNote + 5) % 12,
    (rootNote + 7) % 12,
    (rootNote + 3) % 12,
    (rootNote + 4) % 12,
    (rootNote + 2) % 12,
  ];
  for (const nr of nearbyRoots) {
    if (distractors.length >= 2) break;
    const label = `${getPreferredRootName(nr)}${chord.symbol || ""}`;
    if (!used.has(label)) {
      distractors.push(label);
      used.add(label);
    }
  }

  // 3. Fill remaining with random chords
  while (distractors.length < 3) {
    const rr = randomInt(0, 11);
    const rt = quizTypes[randomInt(0, quizTypes.length - 1)];
    const label = `${getPreferredRootName(rr)}${CHORD_TYPES[rt].symbol || ""}`;
    if (!used.has(label)) {
      distractors.push(label);
      used.add(label);
    }
  }

  const options = shuffle([correctLabel, ...distractors.slice(0, 3)]);

  return {
    type: "chordId",
    notes,
    octave: 3,
    sequential: false,
    correctAnswer: correctLabel,
    options,
    tipKey: chosenId,
  };
}

function generateDiatonicChordIdQuestion(
  keyContext: ChordIdKeyContext,
): QuizQuestion {
  const field = getHarmonicField(keyContext.rootNote, keyContext.isMinor);
  const degreeIndex = randomInt(0, 6);
  const chord = field[degreeIndex];

  const correctLabel = chord.chordName;
  const allLabels = field.map((c) => c.chordName);
  const distractors = pickDistractors(correctLabel, allLabels, 3);
  const options = shuffle([correctLabel, ...distractors]);

  // Map chordSymbol back to a CHORD_TYPES key for tips
  const chordTypeEntry = Object.entries(CHORD_TYPES).find(
    ([, ct]) => ct.symbol === chord.chordSymbol,
  );
  const tipKey = chordTypeEntry ? chordTypeEntry[0] : "major";

  return {
    type: "chordId",
    notes: chord.notes,
    octave: 3,
    sequential: false,
    correctAnswer: correctLabel,
    options,
    tipKey,
  };
}

export function generateQuestion(
  mode: QuizMode,
  isMinor: boolean,
  chordIdKeyContext?: ChordIdKeyContext,
): QuizQuestion {
  switch (mode) {
    case "interval":
      return generateIntervalQuestion();
    case "chordType":
      return generateChordTypeQuestion();
    case "degree":
      return generateDegreeQuestion(isMinor);
    case "chordId":
      return generateChordIdQuestion(chordIdKeyContext);
  }
}
