import type { HarmonicFunction } from "./harmonicFields";

export const HARMONIC_FUNCTION_LABELS: Record<HarmonicFunction, string> = {
  T: "Tônica",
  SD: "Subdominante",
  D: "Dominante",
};

export interface DegreeExplanation {
  degree: number;
  title: string;
  description: string;
}

export const DEGREE_EXPLANATIONS_MAJOR: DegreeExplanation[] = [
  {
    degree: 1,
    title: "I grau - Tônica",
    description:
      "O centro tonal. É o acorde de repouso, para onde a música tende a resolver. Transmite sensação de estabilidade e conclusão.",
  },
  {
    degree: 2,
    title: "II grau - Supertônica",
    description:
      "Função subdominante. Prepara o caminho para a dominante. Muito usado na progressão ii-V-I, uma das mais importantes da música.",
  },
  {
    degree: 3,
    title: "III grau - Mediante",
    description:
      "Função tônica. Compartilha notas com o I grau e pode substituí-lo, criando variação sem perder a sensação de repouso.",
  },
  {
    degree: 4,
    title: "IV grau - Subdominante",
    description:
      "Cria movimento e tensão moderada. É o acorde de 'partida' - nos afasta da tônica sem a urgência da dominante.",
  },
  {
    degree: 5,
    title: "V grau - Dominante",
    description:
      "Gera a maior tensão harmônica. Contém o trítono (intervalo entre a 3ª e a 7ª) que 'pede' resolução para a tônica.",
  },
  {
    degree: 6,
    title: "VI grau - Superdominante",
    description:
      "Função tônica. É a relativa menor da tonalidade maior. Usado para criar resoluções inesperadas (cadência deceptiva).",
  },
  {
    degree: 7,
    title: "VII grau - Sensível",
    description:
      "Função dominante. Acorde diminuto que contém o trítono e tende fortemente a resolver no I grau. Substituto do V7.",
  },
];

export const DEGREE_EXPLANATIONS_MINOR: DegreeExplanation[] = [
  {
    degree: 1,
    title: "I grau - Tônica menor",
    description:
      "Centro tonal da tonalidade menor. Transmite uma sonoridade mais sombria e introspectiva que a tônica maior.",
  },
  {
    degree: 2,
    title: "II grau - Supertônica",
    description:
      "Meio-diminuto na tonalidade menor. Função subdominante, prepara o V grau. Muito usado em progressões de jazz e bossa nova.",
  },
  {
    degree: 3,
    title: "III grau - Mediante",
    description:
      "É a relativa maior da tonalidade menor. Oferece um momento de 'luz' dentro do contexto menor.",
  },
  {
    degree: 4,
    title: "IV grau - Subdominante menor",
    description:
      "Acorde menor com função subdominante. Cria uma tensão mais escura e melancólica que o IV grau maior.",
  },
  {
    degree: 5,
    title: "V grau - Dominante menor",
    description:
      "Na forma natural, é um acorde menor (sem trítono). Para criar resolução forte, usa-se a dominante da menor harmônica (V7).",
  },
  {
    degree: 6,
    title: "VI grau - Submediante",
    description:
      "Acorde maior com função subdominante. Oferece contraste e pode ser usado como ponto de partida para modulações.",
  },
  {
    degree: 7,
    title: "VII grau - Subtônica",
    description:
      "Acorde de tipo dominante (com 7ª menor) mas com função subdominante - não possui a sensível (nota meio tom abaixo da tônica) necessária para função dominante real. Chamado 'subtônica' porque está um tom inteiro abaixo da tônica.",
  },
];
