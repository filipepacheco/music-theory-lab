import type { SectionType } from '@/types';

export const SECTION_LABELS: Record<SectionType, string> = {
  intro: 'Intro',
  verso: 'Verso',
  'pre-refrao': 'Pre-Refrao',
  refrao: 'Refrao',
  ponte: 'Ponte',
  solo: 'Solo',
  outro: 'Outro',
  custom: 'Personalizado',
};

export const SECTION_COLORS: Record<SectionType, string> = {
  intro: '#8b5cf6',
  verso: '#3b82f6',
  'pre-refrao': '#06b6d4',
  refrao: '#f59e0b',
  ponte: '#10b981',
  solo: '#ec4899',
  outro: '#6366f1',
  custom: '#9ca3af',
};
