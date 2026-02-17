export const INTERVAL_NAMES: { semitones: number; label: string; abbr: string }[] = [
  { semitones: 0, label: "Unissono", abbr: "1J" },
  { semitones: 1, label: "Segunda menor", abbr: "2m" },
  { semitones: 2, label: "Segunda maior", abbr: "2M" },
  { semitones: 3, label: "Terca menor", abbr: "3m" },
  { semitones: 4, label: "Terca maior", abbr: "3M" },
  { semitones: 5, label: "Quarta justa", abbr: "4J" },
  { semitones: 6, label: "Tritono", abbr: "TT" },
  { semitones: 7, label: "Quinta justa", abbr: "5J" },
  { semitones: 8, label: "Sexta menor", abbr: "6m" },
  { semitones: 9, label: "Sexta maior", abbr: "6M" },
  { semitones: 10, label: "Setima menor", abbr: "7m" },
  { semitones: 11, label: "Setima maior", abbr: "7M" },
  { semitones: 12, label: "Oitava justa", abbr: "8J" },
];

export const INTERVAL_TIPS: Record<number, string> = {
  0: "O unissono e a mesma nota repetida. E o ponto de partida de tudo.",
  1: "A segunda menor soa tensa e proxima. Pense no tema de Tubarao.",
  2: "A segunda maior e o passo natural da escala. 'Parabens pra voce' comeca assim.",
  3: "A terca menor e o intervalo da tristeza. Define o acorde menor.",
  4: "A terca maior e brilhante e alegre. Define o acorde maior.",
  5: "A quarta justa e aberta e estavel. 'Aquarela do Brasil' comeca com uma quarta.",
  6: "O tritono e o intervalo mais instavel. Divide a oitava ao meio e cria tensao maxima.",
  7: "A quinta justa e poderosa e neutra. Power chords do rock usam so isso.",
  8: "A sexta menor tem um carater melancolico e descendente.",
  9: "A sexta maior e doce e expressiva. Tema de 'My Way' usa esse intervalo.",
  10: "A setima menor e a base dos acordes dominantes. Blues e jazz vivem nesse intervalo.",
  11: "A setima maior soa brilhante e moderna. Muito usada em bossa nova e jazz.",
  12: "A oitava e a mesma nota mais aguda. Perfeita consonancia.",
};

export const CHORD_TYPE_TIPS: Record<string, string> = {
  major: "O acorde maior soa brilhante e estavel. Tres notas: fundamental, terca maior e quinta justa.",
  minor: "O acorde menor soa triste e introspectivo. A unica diferenca do maior: a terca e meio tom mais baixa.",
  dim: "O acorde diminuto soa tenso e instavel. Duas tercas menores empilhadas.",
  aug: "O acorde aumentado soa estranho e sonhador. Duas tercas maiores empilhadas - simetrico.",
  maj7: "O acorde maior com setima maior soa sofisticado e jazzy. Tom Jobim adorava esse acorde.",
  min7: "O menor com setima e suave e melancolico. O acorde mais usado no jazz e MPB.",
  dom7: "O acorde dominante (com setima menor) cria tensao que pede resolucao. Espinha dorsal do blues.",
  dim7: "O diminuto com setima diminuta tem quatro notas equidistantes (tercas menores). Simetrico e muito tenso.",
};

export const DEGREE_TIPS: Record<number, string> = {
  0: "Voce acertou o I grau! A tonica e o centro gravitacional - tudo resolve aqui.",
  1: "O ii grau e subdominante. Prepara o V e forma a progressao ii-V-I, a mais importante do jazz.",
  2: "O iii grau tem funcao de tonica. Sons 'abertos' que lembram o I mas com cor diferente.",
  3: "O IV grau e subdominante. Cria sensacao de partida e abertura. 'Sair de casa'.",
  4: "O V grau e dominante. Tensao maxima. O tritono entre a 3a e 7a desse acorde pede resolucao.",
  5: "O vi grau e a relativa menor. Compartilha notas com o I mas tem uma cor emocional oposta.",
  6: "O vii grau e dominante (diminuto). Contem o tritono e resolve fortemente no I.",
};

export const DEGREE_TIPS_MINOR: Record<number, string> = {
  0: "Voce acertou o i grau! A tonica menor tem sonoridade mais sombria, mas e igualmente o centro gravitacional.",
  1: "O ii grau no menor e meio-diminuto (m7b5). Funcao subdominante, prepara o V na progressao ii-V-i.",
  2: "O III grau e a relativa maior da tonalidade menor. Um momento de 'luz' dentro do contexto menor.",
  3: "O iv grau e subdominante menor. Cria uma tensao mais escura e melancolica que o IV maior.",
  4: "O v grau no menor natural e um acorde menor - dominante fraca, sem tritono. Para resolucao forte, usa-se o V7 da menor harmonica.",
  5: "O VI grau no menor e um acorde maior com funcao subdominante. Oferece contraste e pode iniciar modulacoes.",
  6: "O VII grau e a subtonica - um tom abaixo da tonica. Tipo dominante (7) mas funcao subdominante, pois nao tem a sensivel.",
};

export const CHORD_ID_TIPS: Record<string, string> = {
  major: "Acorde maior: som aberto e brilhante. Tente primeiro identificar a nota mais grave (fundamental), depois confirme se soa 'feliz'.",
  minor: "Acorde menor: som mais escuro e introspectivo. A fundamental e a mesma - o que muda e a terca, meio tom mais baixa.",
  dim: "Acorde diminuto: som tenso e comprimido. Duas tercas menores criam instabilidade. Aparece muito como acorde de passagem.",
  aug: "Acorde aumentado: som flutuante e ambiguo. A quinta elevada cria uma sonoridade suspensa e sonhadora.",
  maj7: "Maior com 7a maior: sofisticado e suave. A setima maior adiciona brilho sem tensao. Muito usado em bossa nova.",
  min7: "Menor com 7a: o acorde mais 'cool' do jazz. Combina a melancolia do menor com a suavidade da setima.",
  dom7: "Dominante (7): tenso e cheio, pedindo resolucao. O tritono entre a 3a e 7a cria a urgencia do blues e jazz.",
  halfDim7: "Meio-diminuto (m7b5): som instavel e melancolico. Combina a quinta diminuta com a setima menor. Aparece no vii grau do campo maior.",
  dim7: "Diminuto com 7a diminuta: quatro tercas menores empilhadas, criando um acorde totalmente simetrico. Funciona como V7(b9) sem fundamental. Muito usado como acorde de passagem cromatica.",
};

export const ROMAN_NUMERALS_MAJOR = ["I", "ii", "iii", "IV", "V", "vi", "vii\u00B0"];
export const ROMAN_NUMERALS_MINOR = ["i", "ii\u00F8", "III", "iv", "v", "VI", "VII"];
