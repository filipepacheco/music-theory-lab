import {
  INTERVAL_TIPS,
  CHORD_TYPE_TIPS,
  DEGREE_TIPS,
  DEGREE_TIPS_MINOR,
  CHORD_ID_TIPS,
} from '@/constants/quizData';
import type { QuizMode } from '@/utils/quizGenerator';

export interface ModeViewContext {
  keyLabel: string;
  keyLimited: boolean;
  isMinor: boolean;
}

export interface QuizModeConfig {
  /** Mode selector button label. */
  label: string;
  /** Mode selector description. */
  modeDescription: string;
  /** Intro line above the scoreboard. */
  description: (ctx: ModeViewContext) => string;
  /** Question prompt shown on the card. */
  prompt: (ctx: ModeViewContext) => string;
  /** Tips table for the current key context. */
  tipsFor: (ctx: ModeViewContext) => Record<string | number, string>;
  /** Whether tip keys are interval semitones (number) or chord type ids (string). */
  tipKeyIsNumber: boolean;
  /** Show the "limit to key" toggle (chordId only). */
  showKeyToggle?: boolean;
  /** Extra line on the start screen. */
  startHint?: string;
}

export const QUIZ_MODE_CONFIGS: Record<QuizMode, QuizModeConfig> = {
  interval: {
    label: 'Intervalos',
    modeDescription: 'Identifique o intervalo entre duas notas',
    description: () =>
      'Duas notas serao tocadas em sequencia. Identifique o intervalo entre elas.',
    prompt: () => 'Qual intervalo voce ouviu?',
    tipsFor: () => INTERVAL_TIPS,
    tipKeyIsNumber: true,
  },
  chordType: {
    label: 'Tipo de Acorde',
    modeDescription: 'Identifique o tipo de acorde tocado',
    description: () =>
      'Um acorde sera tocado. Identifique o tipo (maior, menor, diminuto, etc.).',
    prompt: () => 'Que tipo de acorde voce ouviu?',
    tipsFor: () => CHORD_TYPE_TIPS,
    tipKeyIsNumber: false,
  },
  degree: {
    label: 'Grau no Campo',
    modeDescription: 'Identifique o grau no campo harmonico',
    description: (ctx) =>
      `Um acorde do campo harmonico de ${ctx.keyLabel} sera tocado. Identifique o grau.`,
    prompt: (ctx) => `Qual grau de ${ctx.keyLabel}?`,
    tipsFor: (ctx) => (ctx.isMinor ? DEGREE_TIPS_MINOR : DEGREE_TIPS),
    tipKeyIsNumber: true,
    startHint: 'O I grau (tonica) sera tocado primeiro como referencia.',
  },
  chordId: {
    label: 'Identificar Acorde',
    modeDescription: 'Identifique o acorde completo (nota + tipo)',
    description: (ctx) =>
      ctx.keyLimited
        ? `Acordes do campo de ${ctx.keyLabel}.`
        : 'Acorde aleatorio. Identifique nota + tipo.',
    prompt: () => 'Qual acorde voce ouviu?',
    tipsFor: () => CHORD_ID_TIPS,
    tipKeyIsNumber: false,
    showKeyToggle: true,
  },
};
