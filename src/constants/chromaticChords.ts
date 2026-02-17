export interface ChromaticChordTemplate {
  label: string;
  description: string;
  rootOffset: number;
  chordTypeId: string;
}

export interface ChromaticChordCategory {
  id: string;
  label: string;
  description: string;
  chords: ChromaticChordTemplate[];
}

export const CHROMATIC_CATEGORIES: ChromaticChordCategory[] = [
  {
    id: 'secondary-dominants',
    label: 'Dominantes Secundarios',
    description: 'Acordes dominantes que resolvem em graus do campo harmonico',
    chords: [
      {
        label: 'V7/ii',
        description: 'Dominante do segundo grau',
        rootOffset: 9,
        chordTypeId: 'dom7',
      },
      {
        label: 'V7/iii',
        description: 'Dominante do terceiro grau',
        rootOffset: 11,
        chordTypeId: 'dom7',
      },
      {
        label: 'V7/IV',
        description: 'Dominante do quarto grau',
        rootOffset: 0,
        chordTypeId: 'dom7',
      },
      {
        label: 'V7/V',
        description: 'Dominante do quinto grau',
        rootOffset: 2,
        chordTypeId: 'dom7',
      },
      {
        label: 'V7/vi',
        description: 'Dominante do sexto grau',
        rootOffset: 4,
        chordTypeId: 'dom7',
      },
    ],
  },
  {
    id: 'modal-interchange',
    label: 'Emprestimos Modais',
    description: 'Acordes emprestados do modo menor paralelo',
    chords: [
      {
        label: 'bVII',
        description: 'Setimo grau abaixado (maior)',
        rootOffset: 10,
        chordTypeId: 'major',
      },
      {
        label: 'bVI',
        description: 'Sexto grau abaixado (maior)',
        rootOffset: 8,
        chordTypeId: 'major',
      },
      {
        label: 'bIII',
        description: 'Terceiro grau abaixado (maior)',
        rootOffset: 3,
        chordTypeId: 'major',
      },
      {
        label: 'iv',
        description: 'Quarto grau menor (do menor paralelo)',
        rootOffset: 5,
        chordTypeId: 'minor',
      },
    ],
  },
  {
    id: 'diminished-passing',
    label: 'Diminutos de Passagem',
    description: 'Acordes diminutos que conectam graus cromaticamente',
    chords: [
      {
        label: '#Idim',
        description: 'Diminuto sobre #I (liga I a ii)',
        rootOffset: 1,
        chordTypeId: 'dim7',
      },
      {
        label: '#IIdim',
        description: 'Diminuto sobre #II (liga ii a iii)',
        rootOffset: 3,
        chordTypeId: 'dim7',
      },
      {
        label: '#IVdim',
        description: 'Diminuto sobre #IV (liga IV a V)',
        rootOffset: 6,
        chordTypeId: 'dim7',
      },
    ],
  },
];
