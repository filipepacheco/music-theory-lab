export const INTERVAL_NAMES: { semitones: number; label: string; abbr: string }[] = [
  { semitones: 0, label: "Uníssono", abbr: "1J" },
  { semitones: 1, label: "Segunda menor", abbr: "2m" },
  { semitones: 2, label: "Segunda maior", abbr: "2M" },
  { semitones: 3, label: "Terça menor", abbr: "3m" },
  { semitones: 4, label: "Terça maior", abbr: "3M" },
  { semitones: 5, label: "Quarta justa", abbr: "4J" },
  { semitones: 6, label: "Trítono", abbr: "TT" },
  { semitones: 7, label: "Quinta justa", abbr: "5J" },
  { semitones: 8, label: "Sexta menor", abbr: "6m" },
  { semitones: 9, label: "Sexta maior", abbr: "6M" },
  { semitones: 10, label: "Sétima menor", abbr: "7m" },
  { semitones: 11, label: "Sétima maior", abbr: "7M" },
  { semitones: 12, label: "Oitava justa", abbr: "8J" },
];

export const INTERVAL_TIPS: Record<number, string> = {
  0: "O uníssono é a mesma nota repetida. É o ponto de partida de tudo.",
  1: "A segunda menor soa tensa e próxima. Pense no tema de Tubarão.",
  2: "A segunda maior é o passo natural da escala. 'Parabéns pra você' começa assim.",
  3: "A terça menor é o intervalo da tristeza. Define o acorde menor.",
  4: "A terça maior é brilhante e alegre. Define o acorde maior.",
  5: "A quarta justa é aberta e estável. 'Aquarela do Brasil' começa com uma quarta.",
  6: "O trítono é o intervalo mais instável. Divide a oitava ao meio e cria tensão máxima.",
  7: "A quinta justa é poderosa e neutra. Power chords do rock usam só isso.",
  8: "A sexta menor tem um caráter melancólico e descendente.",
  9: "A sexta maior é doce e expressiva. Tema de 'My Way' usa esse intervalo.",
  10: "A sétima menor é a base dos acordes dominantes. Blues e jazz vivem nesse intervalo.",
  11: "A sétima maior soa brilhante e moderna. Muito usada em bossa nova e jazz.",
  12: "A oitava é a mesma nota mais aguda. Perfeita consonância.",
};

export const CHORD_TYPE_TIPS: Record<string, string> = {
  major: "O acorde maior soa brilhante e estável. Três notas: fundamental, terça maior e quinta justa.",
  minor: "O acorde menor soa triste e introspectivo. A única diferença do maior: a terça é meio tom mais baixa.",
  dim: "O acorde diminuto soa tenso e instável. Duas terças menores empilhadas.",
  aug: "O acorde aumentado soa estranho e sonhador. Duas terças maiores empilhadas - simétrico.",
  maj7: "O acorde maior com sétima maior soa sofisticado e jazzy. Tom Jobim adorava esse acorde.",
  min7: "O menor com sétima é suave e melancólico. O acorde mais usado no jazz e MPB.",
  dom7: "O acorde dominante (com sétima menor) cria tensão que pede resolução. Espinha dorsal do blues.",
  dim7: "O diminuto com sétima diminuta tem quatro notas equidistantes (terças menores). Simétrico e muito tenso.",
};

export const DEGREE_TIPS: Record<number, string> = {
  0: "Você acertou o I grau! A tônica é o centro gravitacional - tudo resolve aqui.",
  1: "O ii grau é subdominante. Prepara o V e forma a progressão ii-V-I, a mais importante do jazz.",
  2: "O iii grau tem função de tônica. Sons 'abertos' que lembram o I mas com cor diferente.",
  3: "O IV grau é subdominante. Cria sensação de partida e abertura. 'Sair de casa'.",
  4: "O V grau é dominante. Tensão máxima. O trítono entre a 3ª e 7ª desse acorde pede resolução.",
  5: "O vi grau é a relativa menor. Compartilha notas com o I mas tem uma cor emocional oposta.",
  6: "O vii grau é dominante (diminuto). Contém o trítono e resolve fortemente no I.",
};

export const DEGREE_TIPS_MINOR: Record<number, string> = {
  0: "Você acertou o i grau! A tônica menor tem sonoridade mais sombria, mas é igualmente o centro gravitacional.",
  1: "O ii grau no menor é meio-diminuto (m7b5). Função subdominante, prepara o V na progressão ii-V-i.",
  2: "O III grau é a relativa maior da tonalidade menor. Um momento de 'luz' dentro do contexto menor.",
  3: "O iv grau é subdominante menor. Cria uma tensão mais escura e melancólica que o IV maior.",
  4: "O v grau no menor natural é um acorde menor - dominante fraca, sem trítono. Para resolução forte, usa-se o V7 da menor harmônica.",
  5: "O VI grau no menor é um acorde maior com função subdominante. Oferece contraste e pode iniciar modulações.",
  6: "O VII grau é a subtônica - um tom abaixo da tônica. Tipo dominante (7) mas função subdominante, pois não tem a sensível.",
};

export const CHORD_ID_TIPS: Record<string, string> = {
  major: "Acorde maior: som aberto e brilhante. Tente primeiro identificar a nota mais grave (fundamental), depois confirme se soa 'feliz'.",
  minor: "Acorde menor: som mais escuro e introspectivo. A fundamental é a mesma - o que muda é a terça, meio tom mais baixa.",
  dim: "Acorde diminuto: som tenso e comprimido. Duas terças menores criam instabilidade. Aparece muito como acorde de passagem.",
  aug: "Acorde aumentado: som flutuante e ambíguo. A quinta elevada cria uma sonoridade suspensa e sonhadora.",
  maj7: "Maior com 7ª maior: sofisticado e suave. A sétima maior adiciona brilho sem tensão. Muito usado em bossa nova.",
  min7: "Menor com 7ª: o acorde mais 'cool' do jazz. Combina a melancolia do menor com a suavidade da sétima.",
  dom7: "Dominante (7): tenso e cheio, pedindo resolução. O trítono entre a 3ª e 7ª cria a urgência do blues e jazz.",
  halfDim7: "Meio-diminuto (m7b5): som instável e melancólico. Combina a quinta diminuta com a sétima menor. Aparece no vii grau do campo maior.",
  dim7: "Diminuto com 7ª diminuta: quatro terças menores empilhadas, criando um acorde totalmente simétrico. Funciona como V7(b9) sem fundamental. Muito usado como acorde de passagem cromática.",
};

export const ROMAN_NUMERALS_MAJOR = ["I", "ii", "iii", "IV", "V", "vi", "vii\u00B0"];
export const ROMAN_NUMERALS_MINOR = ["i", "ii\u00F8", "III", "iv", "v", "VI", "VII"];
