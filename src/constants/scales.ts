export interface ScalePattern {
  id: string;
  label: string;
  intervals: number[];
}

export const SCALE_PATTERNS: Record<string, ScalePattern> = {
  major: {
    id: "major",
    label: "Maior (Jonico)",
    intervals: [0, 2, 4, 5, 7, 9, 11],
  },
  dorian: {
    id: "dorian",
    label: "Dorico",
    intervals: [0, 2, 3, 5, 7, 9, 10],
  },
  phrygian: {
    id: "phrygian",
    label: "Frigio",
    intervals: [0, 1, 3, 5, 7, 8, 10],
  },
  lydian: {
    id: "lydian",
    label: "Lidio",
    intervals: [0, 2, 4, 6, 7, 9, 11],
  },
  mixolydian: {
    id: "mixolydian",
    label: "Mixolidio",
    intervals: [0, 2, 4, 5, 7, 9, 10],
  },
  aeolian: {
    id: "aeolian",
    label: "Menor Natural (Eolio)",
    intervals: [0, 2, 3, 5, 7, 8, 10],
  },
  locrian: {
    id: "locrian",
    label: "Locrio",
    intervals: [0, 1, 3, 5, 6, 8, 10],
  },
  pentatonicMajor: {
    id: "pentatonicMajor",
    label: "Pentatonica Maior",
    intervals: [0, 2, 4, 7, 9],
  },
  pentatonicMinor: {
    id: "pentatonicMinor",
    label: "Pentatonica Menor",
    intervals: [0, 3, 5, 7, 10],
  },
  blues: {
    id: "blues",
    label: "Blues",
    intervals: [0, 3, 5, 6, 7, 10],
  },
  harmonicMinor: {
    id: "harmonicMinor",
    label: "Menor Harmonica",
    intervals: [0, 2, 3, 5, 7, 8, 11],
  },
  melodicMinor: {
    id: "melodicMinor",
    label: "Menor Melodica",
    intervals: [0, 2, 3, 5, 7, 9, 11],
  },
  bluesMajor: {
    id: "bluesMajor",
    label: "Blues Maior",
    intervals: [0, 2, 3, 4, 7, 9],
  },
  wholeTone: {
    id: "wholeTone",
    label: "Tons Inteiros",
    intervals: [0, 2, 4, 6, 8, 10],
  },
  dimWH: {
    id: "dimWH",
    label: "Diminuta (Tom-Semitom)",
    intervals: [0, 2, 3, 5, 6, 8, 9, 11],
  },
  dimHW: {
    id: "dimHW",
    label: "Diminuta Dom-Dim (Semitom-Tom)",
    intervals: [0, 1, 3, 4, 6, 7, 9, 10],
  },
  bebopDominant: {
    id: "bebopDominant",
    label: "Bebop Dominante",
    intervals: [0, 2, 4, 5, 7, 9, 10, 11],
  },
  bebopMajor: {
    id: "bebopMajor",
    label: "Bebop Maior",
    intervals: [0, 2, 4, 5, 7, 8, 9, 11],
  },
  harmonicMajor: {
    id: "harmonicMajor",
    label: "Maior Harmonica",
    intervals: [0, 2, 4, 5, 7, 8, 11],
  },
  hungarianMinor: {
    id: "hungarianMinor",
    label: "Hungara Menor",
    intervals: [0, 2, 3, 6, 7, 8, 11],
  },
};
