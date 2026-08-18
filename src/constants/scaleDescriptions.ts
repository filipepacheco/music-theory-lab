export const SCALE_DESCRIPTIONS: Record<
  string,
  { character: string; usage: string }
> = {
  major: {
    character: "Brilhante, alegre, estável",
    usage: "A escala 'padrão'. Base de toda a harmonia tonal ocidental.",
  },
  dorian: {
    character: "Menor mas com um brilho",
    usage: "Muito usado no jazz, funk e MPB. A 6ª maior é o que diferencia.",
  },
  phrygian: {
    character: "Sombrio e exótico",
    usage: "O b2 dá um sabor espanhol/árabe. Metal usa muito.",
  },
  lydian: {
    character: "Sonhador, flutuante",
    usage: "A #4 cria uma sensação etérea. Tema do Simpsons começa lídio.",
  },
  mixolydian: {
    character: "Maior mas com groove",
    usage: "A b7 tira a 'certeza' do maior. Blues, rock, baião.",
  },
  aeolian: {
    character: "Triste, introspectivo",
    usage: "A escala menor padrão.",
  },
  locrian: {
    character: "Instável, tenso",
    usage: "O b5 tira qualquer sensação de repouso. Raro mas usado em metal progressivo.",
  },
  pentatonicMajor: {
    character: "5 notas, zero tensão",
    usage: "Impossível soar 'errado'. Country, pop, é o início de toda improvisação.",
  },
  pentatonicMinor: {
    character: "A escala do rock e do blues",
    usage: "5 notas poderosas. Se você só aprender uma escala pra solar, é essa.",
  },
  blues: {
    character: "Pentatônica menor + blue note (b5)",
    usage: "Aquela nota 'suja' que dá todo o sabor.",
  },
  harmonicMinor: {
    character: "Menor com drama",
    usage: "A 7ª maior cria a sensação de 'resolução' que a menor natural não tem. Muito usada em neo-classical e flamenco.",
  },
  melodicMinor: {
    character: "Menor que sobe como maior",
    usage: "Usada na subida em música clássica, e em toda forma no jazz moderno.",
  },
  bluesMajor: {
    character: "Pentatônica maior + blue note (b3)",
    usage: "Mistura maior/menor. Muito usada em jazz-blues e gospel.",
  },
  wholeTone: {
    character: "Flutuante, sem resolução",
    usage: "6 notas simétricas. Debussy adorava. Usada sobre V7(#5) e acordes aumentados.",
  },
  dimWH: {
    character: "Simétrica e tensa",
    usage: "8 notas (Tom-Semitom). Usada sobre acordes dim7. Só existem 3 distintas.",
  },
  dimHW: {
    character: "Dominante com cores alteradas",
    usage: "8 notas (Semitom-Tom). Usada sobre V7 - contém b9, #9, #11 e 13 natural.",
  },
  bebopDominant: {
    character: "Mixolídio com nota de passagem cromática",
    usage: "A 7M extra faz as notas do acorde caírem nos tempos fortes em colcheias.",
  },
  bebopMajor: {
    character: "Escala maior com #5 de passagem",
    usage: "Nota cromática entre 5 e 6. Improvisação jazz sobre Imaj7.",
  },
  harmonicMajor: {
    character: "Maior com b6 - entre maior e menor",
    usage: "Gera o acorde iv (subdominante menor). Muito usada em empréstimo modal.",
  },
  hungarianMinor: {
    character: "Exótica, dois intervalos de 2ª aumentada",
    usage: "Música cigana, flamenco e composição cinematográfica. Também chamada 'escala cigana menor'.",
  },
};
