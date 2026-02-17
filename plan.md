# Music Theory Lab — Plano Técnico

## Visão Geral

App interativo e didático para aprendizado de teoria musical, com áudio real via Tone.js, visualização em piano e braço de baixo, e explicações contextuais.

---

## Stack

| Tecnologia | Uso |
|---|---|
| **React 18+** (Vite) | Framework principal |
| **TypeScript** | Tipagem |
| **Tone.js** | Engine de áudio (synth, sequenciamento) |
| **Tailwind CSS** | Estilização |
| **Zustand** ou **Context API** | Estado global (tonalidade selecionada, módulo ativo) |
| **Framer Motion** | Animações e transições |

---

## Estrutura de Pastas

```
src/
├── App.tsx
├── main.tsx
├── styles/
│   └── globals.css              # Tailwind + CSS variables (cores por função)
├── constants/
│   ├── notes.ts                 # NOTE_NAMES, NOTE_NAMES_FLAT
│   ├── scales.ts                # Patterns de escalas e modos
│   ├── chords.ts                # Intervalos dos tipos de acorde
│   ├── harmonicFields.ts        # Campo harmônico maior/menor
│   ├── progressions.ts          # Progressões pré-prontas
│   └── explanations.ts          # Textos didáticos do "professor"
├── utils/
│   ├── musicTheory.ts           # Funções puras: getScaleNotes, getChordNotes, getHarmonicField
│   ├── noteHelpers.ts           # getNoteName, midiToNoteName, noteToFreq
│   └── quizGenerator.ts         # Lógica de geração de perguntas
├── hooks/
│   ├── useSynth.ts              # Hook do Tone.js (playNote, playChord, playScale, playSequence)
│   ├── useAudioContext.ts       # Inicialização e resume do AudioContext
│   └── useQuiz.ts               # Estado e lógica do quiz
├── store/
│   └── useAppStore.ts           # Estado global (tonalidade, modo, módulo ativo)
├── components/
│   ├── layout/
│   │   ├── Header.tsx           # Logo + navegação entre módulos
│   │   ├── ModuleNav.tsx        # Tabs dos 4 módulos
│   │   └── KeySelector.tsx      # Seletor de tonalidade + maior/menor (global)
│   ├── instruments/
│   │   ├── Piano.tsx            # Piano interativo (2 oitavas)
│   │   ├── PianoKey.tsx         # Tecla individual
│   │   ├── BassNeck.tsx         # Braço de baixo (EADG, 12 casas)
│   │   ├── BassFret.tsx         # Casa individual
│   │   └── NoteIndicator.tsx    # Bolinha/label de nota reutilizável
│   ├── harmonicField/
│   │   ├── HarmonicFieldModule.tsx    # Módulo completo
│   │   ├── ChordCard.tsx              # Card de cada acorde (grau, nome, função)
│   │   ├── ChordGrid.tsx             # Grid dos 7 acordes
│   │   └── FunctionLegend.tsx        # Legenda T/SD/D com cores
│   ├── progressions/
│   │   ├── ProgressionModule.tsx      # Módulo completo
│   │   ├── ProgressionTimeline.tsx    # Timeline com acordes arrastáveis
│   │   ├── ProgressionSlot.tsx        # Slot individual na timeline
│   │   ├── PresetList.tsx             # Lista de progressões pré-prontas
│   │   ├── ProgressionAnalysis.tsx    # Análise harmônica com explicação
│   │   └── PlaybackControls.tsx       # Play/Stop/BPM
│   ├── scales/
│   │   ├── ScalesModule.tsx           # Módulo completo
│   │   ├── ScaleSelector.tsx          # Dropdown de escala/modo
│   │   ├── ScaleComparison.tsx        # Comparação lado a lado
│   │   ├── ScaleInfo.tsx              # Info: notas, intervalos, caráter
│   │   └── ModeCharacterCard.tsx      # "Cor" e descrição do modo
│   ├── quiz/
│   │   ├── QuizModule.tsx             # Módulo completo
│   │   ├── IntervalQuiz.tsx           # Quiz de intervalos
│   │   ├── ChordTypeQuiz.tsx          # Quiz de tipo de acorde
│   │   ├── DegreeQuiz.tsx             # Quiz de grau no campo
│   │   ├── QuizCard.tsx               # Card de pergunta genérico
│   │   ├── QuizOptions.tsx            # Botões de resposta
│   │   └── ScoreBoard.tsx             # Pontuação e stats
│   └── shared/
│       ├── TeacherTip.tsx             # Balão do "professor" com explicação
│       ├── Tooltip.tsx                # Tooltip genérico
│       └── Badge.tsx                  # Badge de função harmônica (T/SD/D)
```

---

## Design System

### Cores (CSS Variables)

```css
:root {
  /* Base - Dark Mode */
  --bg-primary: #0f1117;
  --bg-secondary: #1a1d27;
  --bg-card: #222632;
  --bg-elevated: #2a2f3e;
  --text-primary: #e8eaf0;
  --text-secondary: #8b90a0;
  --text-muted: #5a5f70;
  --border: #2e3344;

  /* Funções Harmônicas */
  --tonica: #4a9eff;          /* Azul */
  --tonica-bg: #4a9eff18;
  --tonica-glow: #4a9eff40;

  --subdominante: #34d399;    /* Verde */
  --subdominante-bg: #34d39918;
  --subdominante-glow: #34d39940;

  --dominante: #fb923c;       /* Laranja */
  --dominante-bg: #fb923c18;
  --dominante-glow: #fb923c40;

  /* Interação */
  --accent: #a78bfa;          /* Roxo - destaque geral */
  --correct: #4ade80;         /* Verde - quiz acerto */
  --wrong: #f87171;           /* Vermelho - quiz erro */

  /* Piano */
  --piano-white: #e8eaf0;
  --piano-black: #1a1d27;
  --piano-highlight: var(--accent);

  /* Braço do baixo */
  --fretboard: #3d2b1f;
  --fret-wire: #8b8b8b;
  --string: #c0c0c0;
}
```

### Tipografia

```
Heading: "JetBrains Mono" (monospace, combina com o tema técnico/musical)
Body: "IBM Plex Sans"
Notas musicais: "JetBrains Mono" (bold, para C, D#, Bb etc.)
```

### Padrão dos Cards de Acorde

```
┌─────────────────────┐
│  ii                  │  ← Grau romano (grande, monospace)
│  Dm7                 │  ← Nome do acorde
│  ● Subdominante      │  ← Badge colorido com função
│                      │
│  D  F  A  C          │  ← Notas do acorde
│  1  ♭3  5  ♭7        │  ← Intervalos
└─────────────────────┘
    borda: cor da função
    click: toca acorde + destaca no piano/baixo
```

---

## Módulos — Detalhamento

### 1. Campo Harmônico (`harmonicField/`)

**Comportamento:**
- `KeySelector` global define a tonalidade e modo (maior/menor)
- `ChordGrid` renderiza 7 `ChordCard`s numa row horizontal
- Ao clicar num card:
    - Toca o acorde (PolySynth, tétrade)
    - Destaca notas no `Piano` e no `BassNeck`
    - `TeacherTip` mostra explicação contextual sobre aquele grau/função
- Acordes com borda e glow na cor da função

**Textos do "professor" (exemplos):**
```ts
// constants/explanations.ts
export const DEGREE_EXPLANATIONS: Record<string, string> = {
  "I": "O I grau é a Tônica — é o 'lar' da tonalidade. Toda música tende a querer resolver aqui. É estabilidade pura.",
  "ii": "O ii grau é a Subdominante menor. Ele prepara o caminho pro V, criando aquele movimento clássico ii → V → I, a progressão mais importante do jazz.",
  "iii": "O iii grau tem função de Tônica — ele compartilha duas notas com o I grau, então soa como uma extensão suave do centro tonal.",
  "IV": "O IV grau é a Subdominante maior. Cria sensação de abertura e movimento. Pense nele como o primeiro passo pra sair de casa.",
  "V": "O V grau é a Dominante — é tensão pura. Ele tem o trítono da tonalidade, aquele intervalo instável que pede resolução de volta pro I.",
  "vi": "O vi grau é o relativo menor. Compartilha a escala com o I, mas com uma cor emocional completamente diferente. É a tristeza dentro da alegria.",
  "vii°": "O vii° tem função Dominante — ele também contém o trítono, mas é mais raro. Funciona como um V7 sem fundamental."
};
```

---

### 2. Construtor de Progressões (`progressions/`)

**Comportamento:**
- `ProgressionTimeline`: array de slots (máx ~12)
- Adiciona acordes clicando nos cards do campo harmônico
- Ou carrega preset de `PresetList`
- `PlaybackControls`: Play/Stop + slider de BPM (60-180)
- Play: `Tone.Transport` sequencia os acordes, destaca o ativo no timeline, piano e baixo
- `ProgressionAnalysis`: mostra a sequência de graus e texto explicativo

**Progressões pré-carregadas:**
```ts
// constants/progressions.ts
export const PRESETS = [
  {
    name: "Pop Clássico",
    degrees: [0, 4, 3, 5],        // I - V - vi - IV (index no campo)
    label: "I → V → vi → IV",
    description: "A progressão mais usada na música pop. De 'Let It Be' a 'No Woman No Cry'. Funciona porque alterna entre tensão e resolução de forma previsível e satisfatória."
  },
  {
    name: "Jazz II-V-I",
    degrees: [1, 4, 0],
    label: "ii → V → I",
    description: "A espinha dorsal do jazz. O ii prepara, o V tensiona, o I resolve. Quando você ouve e entende essa progressão, você entende 80% do jazz."
  },
  {
    name: "Bossa Nova",
    degrees: [0, 1, 4, 0],
    label: "I → ii → V → I",
    description: "Tom Jobim e João Gilberto viviam nessa. A adição do I no início dá aquele respiro antes do movimento ii-V-I."
  },
  {
    name: "Blues (simplificado)",
    degrees: [0, 3, 0, 4, 3, 0],
    label: "I → IV → I → V → IV → I",
    description: "A base do blues e do rock. Só usa acordes de função primária (T, SD, D). Simples, mas infinitamente expressivo."
  },
  {
    name: "Canon de Pachelbel",
    degrees: [0, 4, 5, 2, 3, 0, 3, 4],
    label: "I → V → vi → iii → IV → I → IV → V",
    description: "Uma das progressões mais antigas e copiadas da história. Green Day, Oasis, Maroon 5 — todo mundo já usou alguma variação."
  },
  {
    name: "Andaluz",
    degrees: [5, 4, 3, 0],
    label: "vi → V → IV → I (ou i → VII → VI → V em menor)",
    description: "Descendente e dramático. Base do flamenco, mas aparece em tudo que é rock e metal também. Hit the Road Jack vive aqui."
  },
  {
    name: "Doo-Wop / Anos 50",
    degrees: [0, 5, 3, 4],
    label: "I → vi → IV → V",
    description: "A progressão nostálgica por excelência. Stand By Me, Every Breath You Take. Circular e reconfortante."
  },
  {
    name: "Emo / Pop Punk",
    degrees: [0, 4, 5, 3],
    label: "I → V → vi → IV",
    description: "Variação do pop clássico que começa na tônica. Muito usada no pop-punk e indie dos anos 2000."
  },
];
```

**Lógica de playback:**
```ts
// Dentro de useSynth.ts
const playProgression = (chords: number[][], bpm: number) => {
  const duration = 60 / bpm; // duração de cada acorde em segundos
  Tone.Transport.bpm.value = bpm;
  Tone.Transport.cancel();

  chords.forEach((chord, i) => {
    Tone.Transport.schedule((time) => {
      polySynth.triggerAttackRelease(
        chord.map(note => noteToFreqString(note, 3)), // oitava 3
        `${duration * 0.9}`,
        time
      );
      // callback pra UI: setActiveChordIndex(i)
    }, i * duration);
  });

  Tone.Transport.start();
};
```

---

### 3. Escalas e Modos (`scales/`)

**Escalas disponíveis:**
```ts
export const SCALE_PATTERNS = {
  // Modos da escala maior
  major:        { pattern: [0,2,4,5,7,9,11], name: "Maior (Jônio)",    character: "Brilhante, alegre, estável. A escala 'padrão'." },
  dorian:       { pattern: [0,2,3,5,7,9,10], name: "Dórico",           character: "Menor mas com um brilho. Muito usado no jazz, funk e MPB. A 6ª maior é o que diferencia." },
  phrygian:     { pattern: [0,1,3,5,7,8,10], name: "Frígio",           character: "Sombrio e exótico. O b2 dá um sabor espanhol/árabe. Metal usa muito." },
  lydian:       { pattern: [0,2,4,6,7,9,11], name: "Lídio",            character: "Sonhador, flutuante. A #4 cria uma sensação etérea. Tema do Simpsons começa lídio." },
  mixolydian:   { pattern: [0,2,4,5,7,9,10], name: "Mixolídio",        character: "Maior mas com groove. A b7 tira a 'certeza' do maior. Blues, rock, baião." },
  aeolian:      { pattern: [0,2,3,5,7,8,10], name: "Menor Natural (Eólio)", character: "Triste, introspectivo. A escala menor padrão." },
  locrian:      { pattern: [0,1,3,5,6,8,10], name: "Lócrio",           character: "Instável, tenso. O b5 tira qualquer sensação de repouso. Raro mas usado em metal progressivo." },

  // Outras
  harmonicMinor: { pattern: [0,2,3,5,7,8,11], name: "Menor Harmônica", character: "Menor com drama. A 7ª maior cria a sensação de 'resolução' que a menor natural não tem. Muito usada em neo-classical e flamenco." },
  melodicMinor:  { pattern: [0,2,3,5,7,9,11], name: "Menor Melódica",  character: "Menor que sobe como maior. Usada na subida em música clássica, e em toda forma no jazz moderno." },
  pentatonicMaj: { pattern: [0,2,4,7,9],      name: "Pentatônica Maior", character: "5 notas, zero tensão. Impossível soar 'errado'. Country, pop, e o início de toda improvisação." },
  pentatonicMin: { pattern: [0,3,5,7,10],      name: "Pentatônica Menor", character: "A escala do rock e do blues. 5 notas poderosas. Se você só aprender uma escala pra solar, é essa." },
  blues:         { pattern: [0,3,5,6,7,10],    name: "Blues",           character: "Pentatônica menor + blue note (b5). Aquela nota 'suja' que dá todo o sabor." },
};
```

**Comparação lado a lado:**
- Duas colunas: Escala A e Escala B
- Piano e braço de baixo mostram ambas com cores diferentes
- Notas em comum ficam com uma cor, notas diferentes ficam destacadas com glow
- Exemplo: Dórico vs Menor Natural → destaca a 6ª (a única diferença)

**Braço do baixo — renderização:**
```ts
// components/instruments/BassNeck.tsx
const BASS_TUNING = [40, 45, 50, 55]; // MIDI: E1, A1, D2, G2
const FRET_COUNT = 12;

// Cada posição:
// fret 0 = corda solta
// fret N = BASS_TUNING[string] + N
// Nota na posição = (BASS_TUNING[string] + fret) % 12

// Visual:
// ┌──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┐
// │G │  │  │  │  │  │  │  │  │  │  │  │  │  ← corda G
// │D │  │  │  │  │  │  │  │  │  │  │  │  │  ← corda D
// │A │  │  │  │  │  │  │  │  │  │  │  │  │  ← corda A
// │E │  │  │  │  │  │  │  │  │  │  │  │  │  ← corda E
// └──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┘
//  0   1   2   3   4   5   6   7   8   9  10  11  12
//              ●       ●       ●       ●      ●●
//                          (marcações de casa)

// Props:
interface BassNeckProps {
  highlightedNotes: number[];       // notas pra destacar (0-11)
  noteColors?: Map<number, string>; // cor por nota (pra comparação)
  rootNote?: number;                // nota raiz (destaque especial)
  onNoteClick?: (note: number, octave: number) => void;
}
```

---

### 4. Quiz Auditivo (`quiz/`)

**3 modos (todos abertos desde o início):**

**a) Intervalos:**
- Toca duas notas sequenciais
- Opções: Unísono, 2ªm, 2ªM, 3ªm, 3ªM, 4ªJ, Trítono, 5ªJ, 6ªm, 6ªM, 7ªm, 7ªM, 8ªJ
- Nota raiz sempre aleatória pra não viciar

**b) Tipo de Acorde:**
- Toca um acorde (3 ou 4 notas simultâneas)
- Opções: Maior, Menor, Diminuto, Aumentado, Maj7, Min7, Dom7
- Nota raiz aleatória

**c) Grau no Campo:**
- Define uma tonalidade, toca o I grau pra referência
- Depois toca outro grau aleatório
- Opções: I, ii, iii, IV, V, vi, vii°

**Lógica:**
```ts
// utils/quizGenerator.ts
interface QuizQuestion {
  type: 'interval' | 'chordType' | 'degree';
  audio: number[];        // MIDI notes to play
  correctAnswer: string;
  options: string[];
}

// Feedback após resposta:
// ✅ Correto: flash verde + TeacherTip com info ("Uma 3ª menor soa mais 'triste' que a maior")
// ❌ Errado: flash vermelho + mostra resposta certa + toca novamente + TeacherTip
```

**Pontuação:**
- Acertos / Total por categoria
- Streak (sequência de acertos)
- Sem persistência (reseta ao recarregar) — ou usar localStorage se quiser

---

## Hook de Áudio — API

```ts
// hooks/useSynth.ts
interface UseSynthReturn {
  isReady: boolean;
  initAudio: () => Promise<void>;     // precisa de user gesture pro browser
  playNote: (noteIndex: number, octave?: number, duration?: number) => void;
  playChord: (noteIndices: number[], octave?: number, duration?: number) => void;
  playScale: (noteIndices: number[], octave?: number, tempo?: number) => void;
  playProgression: (chords: number[][], bpm: number, onChordChange?: (index: number) => void) => void;
  stopAll: () => void;
}

// Implementação usa:
// - Tone.Synth para notas individuais (quiz, escalas)
// - Tone.PolySynth para acordes
// - Tone.Transport para sequenciamento de progressões

// Timbre sugerido: triangle wave com leve envelope
// Synth config:
{
  oscillator: { type: "triangle8" },
  envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.8 },
  volume: -8
}
```

---

## Fluxo de Estado Global

```ts
// store/useAppStore.ts (Zustand)
interface AppState {
  // Global
  rootNote: number;              // 0-11 (C=0)
  isMinor: boolean;              // maior ou menor
  activeModule: 'field' | 'progressions' | 'scales' | 'quiz';

  // Campo harmônico
  selectedChordIndex: number | null;
  harmonicField: HarmonicChord[];

  // Progressão
  progression: number[];          // índices no campo harmônico
  bpm: number;
  isPlaying: boolean;
  activeProgressionIndex: number;

  // Escalas
  selectedScale: string;
  comparisonScale: string | null;

  // Quiz
  quizMode: 'interval' | 'chordType' | 'degree';
  score: { correct: number; total: number; streak: number };

  // Instrumentos
  highlightedNotes: number[];     // notas pra destacar no piano/baixo
  highlightColors: Map<number, string>;
}
```

---

## Ordem de Implementação Sugerida

### Fase 1 — Fundação
1. Setup Vite + React + TS + Tailwind
2. `constants/` — todas as constantes musicais
3. `utils/musicTheory.ts` — funções puras
4. `hooks/useSynth.ts` — engine de áudio
5. `store/useAppStore.ts` — estado global

### Fase 2 — Instrumentos
6. `Piano.tsx` + `PianoKey.tsx` — piano interativo (2 oitavas, C3-B4)
7. `BassNeck.tsx` + `BassFret.tsx` — braço do baixo
8. `NoteIndicator.tsx` — componente de nota reutilizável
9. Integrar click → som em ambos instrumentos

### Fase 3 — Módulo 1 (Campo Harmônico)
10. `KeySelector.tsx`
11. `ChordCard.tsx` + `ChordGrid.tsx`
12. `HarmonicFieldModule.tsx`
13. `TeacherTip.tsx` + textos do professor
14. Integração: click no acorde → destaca nos instrumentos + toca

### Fase 4 — Módulo 2 (Progressões)
15. `ProgressionTimeline.tsx` + `ProgressionSlot.tsx`
16. `PresetList.tsx`
17. `PlaybackControls.tsx` (play/stop/BPM)
18. `ProgressionAnalysis.tsx`
19. Sequenciamento com `Tone.Transport`

### Fase 5 — Módulo 3 (Escalas)
20. `ScaleSelector.tsx`
21. `ScaleInfo.tsx` + `ModeCharacterCard.tsx`
22. `ScaleComparison.tsx` (lado a lado)
23. Integração com piano + baixo (cores diferentes pra cada escala)

### Fase 6 — Módulo 4 (Quiz)
24. `quizGenerator.ts`
25. `QuizCard.tsx` + `QuizOptions.tsx`
26. `IntervalQuiz.tsx`, `ChordTypeQuiz.tsx`, `DegreeQuiz.tsx`
27. `ScoreBoard.tsx`

### Fase 7 — Polish
28. Animações (Framer Motion nas transições de módulo e feedback do quiz)
29. Responsividade
30. Tooltips e estados de hover
31. Teste de todos os fluxos de áudio

---

## Dicas de Implementação

### Tone.js — AudioContext
O browser bloqueia áudio até interação do usuário. Primeiro click em qualquer lugar:
```ts
const initAudio = async () => {
  await Tone.start();
  console.log("Audio ready");
};
```
Coloque um botão ou overlay "Clique para ativar áudio" no primeiro acesso.

### Nota → Frequência (pra Tone.js)
```ts
// Tone.js aceita notação tipo "C4", "D#3", "Bb5"
const noteToToneString = (noteIndex: number, octave: number): string => {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[noteIndex]}${octave}`;
};
```

### Performance do Piano
- Use `React.memo` em cada tecla
- Passe apenas as props necessárias (isHighlighted, color, noteIndex)
- Evite re-render do piano inteiro ao mudar uma nota

### Braço do baixo — Notas por posição
```ts
const getNoteAtPosition = (string: number, fret: number): number => {
  const TUNING = [4, 9, 2, 7]; // E=4, A=9, D=2, G=7 (em índices 0-11)
  return (TUNING[string] + fret) % 12;
};
```