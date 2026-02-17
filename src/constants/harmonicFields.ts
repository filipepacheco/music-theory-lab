export type HarmonicFunction = "T" | "SD" | "D";

export interface DegreeTemplate {
  degree: number;
  romanNumeral: string;
  chordType: string;
  harmonicFunction: HarmonicFunction;
  scaleInterval: number;
}

export const MAJOR_FIELD: DegreeTemplate[] = [
  {
    degree: 1,
    romanNumeral: "I",
    chordType: "maj7",
    harmonicFunction: "T",
    scaleInterval: 0,
  },
  {
    degree: 2,
    romanNumeral: "ii",
    chordType: "min7",
    harmonicFunction: "SD",
    scaleInterval: 2,
  },
  {
    degree: 3,
    romanNumeral: "iii",
    chordType: "min7",
    harmonicFunction: "T",
    scaleInterval: 4,
  },
  {
    degree: 4,
    romanNumeral: "IV",
    chordType: "maj7",
    harmonicFunction: "SD",
    scaleInterval: 5,
  },
  {
    degree: 5,
    romanNumeral: "V",
    chordType: "dom7",
    harmonicFunction: "D",
    scaleInterval: 7,
  },
  {
    degree: 6,
    romanNumeral: "vi",
    chordType: "min7",
    harmonicFunction: "T",
    scaleInterval: 9,
  },
  {
    degree: 7,
    romanNumeral: "vii\u00B0",
    chordType: "halfDim7",
    harmonicFunction: "D",
    scaleInterval: 11,
  },
];

export const MINOR_FIELD: DegreeTemplate[] = [
  {
    degree: 1,
    romanNumeral: "i",
    chordType: "min7",
    harmonicFunction: "T",
    scaleInterval: 0,
  },
  {
    degree: 2,
    romanNumeral: "ii\u00F8",
    chordType: "halfDim7",
    harmonicFunction: "SD",
    scaleInterval: 2,
  },
  {
    degree: 3,
    romanNumeral: "III",
    chordType: "maj7",
    harmonicFunction: "T",
    scaleInterval: 3,
  },
  {
    degree: 4,
    romanNumeral: "iv",
    chordType: "min7",
    harmonicFunction: "SD",
    scaleInterval: 5,
  },
  {
    degree: 5,
    romanNumeral: "v",
    chordType: "min7",
    harmonicFunction: "D",
    scaleInterval: 7,
  },
  {
    degree: 6,
    romanNumeral: "VI",
    chordType: "maj7",
    harmonicFunction: "SD",
    scaleInterval: 8,
  },
  {
    degree: 7,
    romanNumeral: "VII",
    chordType: "dom7",
    harmonicFunction: "SD",
    scaleInterval: 10,
  },
];
