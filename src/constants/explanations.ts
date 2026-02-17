import type { HarmonicFunction } from "./harmonicFields";

export const HARMONIC_FUNCTION_LABELS: Record<HarmonicFunction, string> = {
  T: "Tonica",
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
    title: "I grau - Tonica",
    description:
      "O centro tonal. E o acorde de repouso, para onde a musica tende a resolver. Transmite sensacao de estabilidade e conclusao.",
  },
  {
    degree: 2,
    title: "II grau - Supertonica",
    description:
      "Funcao subdominante. Prepara o caminho para a dominante. Muito usado na progressao ii-V-I, uma das mais importantes da musica.",
  },
  {
    degree: 3,
    title: "III grau - Mediante",
    description:
      "Funcao tonica. Compartilha notas com o I grau e pode substituí-lo, criando variacao sem perder a sensacao de repouso.",
  },
  {
    degree: 4,
    title: "IV grau - Subdominante",
    description:
      "Cria movimento e tensao moderada. E o acorde de 'partida' - nos afasta da tonica sem a urgencia da dominante.",
  },
  {
    degree: 5,
    title: "V grau - Dominante",
    description:
      "Gera a maior tensao harmonica. Contem o tritono (intervalo entre a 3a e a 7a) que 'pede' resolucao para a tonica.",
  },
  {
    degree: 6,
    title: "VI grau - Superdominante",
    description:
      "Funcao tonica. E a relativa menor da tonalidade maior. Usado para criar resolucoes inesperadas (cadencia deceptiva).",
  },
  {
    degree: 7,
    title: "VII grau - Sensivel",
    description:
      "Funcao dominante. Acorde diminuto que contem o tritono e tende fortemente a resolver no I grau. Substituto do V7.",
  },
];

export const DEGREE_EXPLANATIONS_MINOR: DegreeExplanation[] = [
  {
    degree: 1,
    title: "I grau - Tonica menor",
    description:
      "Centro tonal da tonalidade menor. Transmite uma sonoridade mais sombria e introspectiva que a tonica maior.",
  },
  {
    degree: 2,
    title: "II grau - Supertonica",
    description:
      "Meio-diminuto na tonalidade menor. Funcao subdominante, prepara o V grau. Muito usado em progressoes de jazz e bossa nova.",
  },
  {
    degree: 3,
    title: "III grau - Mediante",
    description:
      "E a relativa maior da tonalidade menor. Oferece um momento de 'luz' dentro do contexto menor.",
  },
  {
    degree: 4,
    title: "IV grau - Subdominante menor",
    description:
      "Acorde menor com funcao subdominante. Cria uma tensao mais escura e melancolica que o IV grau maior.",
  },
  {
    degree: 5,
    title: "V grau - Dominante menor",
    description:
      "Na forma natural, e um acorde menor (sem tritono). Para criar resolucao forte, usa-se a dominante da menor harmonica (V7).",
  },
  {
    degree: 6,
    title: "VI grau - Submediante",
    description:
      "Acorde maior com funcao subdominante. Oferece contraste e pode ser usado como ponto de partida para modulacoes.",
  },
  {
    degree: 7,
    title: "VII grau - Subtonica",
    description:
      "Acorde de tipo dominante (com 7a menor) mas com funcao subdominante - nao possui a sensivel (nota meio tom abaixo da tonica) necessaria para funcao dominante real. Chamado 'subtonica' porque esta um tom inteiro abaixo da tonica.",
  },
];
