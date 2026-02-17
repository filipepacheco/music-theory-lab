export const SCALE_DESCRIPTIONS: Record<
  string,
  { character: string; usage: string }
> = {
  major: {
    character: "Brilhante, alegre, estavel",
    usage: "A escala 'padrao'. Base de toda a harmonia tonal ocidental.",
  },
  dorian: {
    character: "Menor mas com um brilho",
    usage: "Muito usado no jazz, funk e MPB. A 6a maior e o que diferencia.",
  },
  phrygian: {
    character: "Sombrio e exotico",
    usage: "O b2 da um sabor espanhol/arabe. Metal usa muito.",
  },
  lydian: {
    character: "Sonhador, flutuante",
    usage: "A #4 cria uma sensacao eterea. Tema do Simpsons comeca lidio.",
  },
  mixolydian: {
    character: "Maior mas com groove",
    usage: "A b7 tira a 'certeza' do maior. Blues, rock, baiao.",
  },
  aeolian: {
    character: "Triste, introspectivo",
    usage: "A escala menor padrao.",
  },
  locrian: {
    character: "Instavel, tenso",
    usage: "O b5 tira qualquer sensacao de repouso. Raro mas usado em metal progressivo.",
  },
  pentatonicMajor: {
    character: "5 notas, zero tensao",
    usage: "Impossivel soar 'errado'. Country, pop, e o inicio de toda improvisacao.",
  },
  pentatonicMinor: {
    character: "A escala do rock e do blues",
    usage: "5 notas poderosas. Se voce so aprender uma escala pra solar, e essa.",
  },
  blues: {
    character: "Pentatonica menor + blue note (b5)",
    usage: "Aquela nota 'suja' que da todo o sabor.",
  },
  harmonicMinor: {
    character: "Menor com drama",
    usage: "A 7a maior cria a sensacao de 'resolucao' que a menor natural nao tem. Muito usada em neo-classical e flamenco.",
  },
  melodicMinor: {
    character: "Menor que sobe como maior",
    usage: "Usada na subida em musica classica, e em toda forma no jazz moderno.",
  },
  bluesMajor: {
    character: "Pentatonica maior + blue note (b3)",
    usage: "Mistura maior/menor. Muito usada em jazz-blues e gospel.",
  },
  wholeTone: {
    character: "Flutuante, sem resolucao",
    usage: "6 notas simetricas. Debussy adorava. Usada sobre V7(#5) e acordes aumentados.",
  },
  dimWH: {
    character: "Simetrica e tensa",
    usage: "8 notas (Tom-Semitom). Usada sobre acordes dim7. So existem 3 distintas.",
  },
  dimHW: {
    character: "Dominante com cores alteradas",
    usage: "8 notas (Semitom-Tom). Usada sobre V7 - contem b9, #9, #11 e 13 natural.",
  },
  bebopDominant: {
    character: "Mixolidio com nota de passagem cromatica",
    usage: "A 7M extra faz as notas do acorde cairem nos tempos fortes em colcheias.",
  },
  bebopMajor: {
    character: "Escala maior com #5 de passagem",
    usage: "Nota cromatica entre 5 e 6. Improvisacao jazz sobre Imaj7.",
  },
  harmonicMajor: {
    character: "Maior com b6 - entre maior e menor",
    usage: "Gera o acorde iv (subdominante menor). Muito usada em emprestimo modal.",
  },
  hungarianMinor: {
    character: "Exotica, dois intervalos de 2a aumentada",
    usage: "Musica cigana, flamenco e composicao cinematografica. Tambem chamada 'escala cigana menor'.",
  },
};
