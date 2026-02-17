export interface ChordType {
  id: string;
  label: string;
  symbol: string;
  intervals: number[];
}

export const CHORD_TYPES: Record<string, ChordType> = {
  major: { id: "major", label: "Maior", symbol: "", intervals: [0, 4, 7] },
  minor: { id: "minor", label: "Menor", symbol: "m", intervals: [0, 3, 7] },
  dim: {
    id: "dim",
    label: "Diminuto",
    symbol: "dim",
    intervals: [0, 3, 6],
  },
  aug: {
    id: "aug",
    label: "Aumentado",
    symbol: "aug",
    intervals: [0, 4, 8],
  },
  maj7: {
    id: "maj7",
    label: "Maior com 7a maior",
    symbol: "maj7",
    intervals: [0, 4, 7, 11],
  },
  min7: {
    id: "min7",
    label: "Menor com 7a menor",
    symbol: "m7",
    intervals: [0, 3, 7, 10],
  },
  dom7: {
    id: "dom7",
    label: "Dominante (7a menor)",
    symbol: "7",
    intervals: [0, 4, 7, 10],
  },
  halfDim7: {
    id: "halfDim7",
    label: "Meio-diminuto",
    symbol: "m7(b5)",
    intervals: [0, 3, 6, 10],
  },
  dim7: {
    id: "dim7",
    label: "Diminuto com 7a diminuta",
    symbol: "dim7",
    intervals: [0, 3, 6, 9],
  },
};
