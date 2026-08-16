import type { ProgressionStep } from '@/constants/progressions';
import type { SongSection } from '@/types';
import type { GpTranscription, TranscribedBar } from '@/services/transcribeGp';

export interface GpImportOptions {
  createId?: () => string;
  sectionLabel?: string;
  referenceRoot?: number;
}

export interface GpImportResult {
  referenceRoot: number;
  sections: SongSection[];
  resolvedBars: number;
  uncertainBars: number;
  silentBars: number;
}

function toRelativeIntervals(
  bar: Extract<TranscribedBar['result'], { kind: 'chord' }>,
  referenceRoot: number,
): number[] {
  return bar.intervals.map(
    (interval) => (bar.root + interval - referenceRoot + 24) % 12,
  );
}

function toStep(bar: TranscribedBar, referenceRoot: number): ProgressionStep {
  if (bar.result.kind === 'chord') {
    return {
      degree: null,
      label: bar.label ?? 'Acorde',
      intervals: toRelativeIntervals(bar.result, referenceRoot),
      beats: bar.quarterNoteBeats,
      confidence: 'sure',
    };
  }

  return {
    degree: null,
    label: bar.result.kind === 'unclear' ? 'Incerto' : 'Sem acorde',
    beats: bar.quarterNoteBeats,
    confidence: 'unsure',
  };
}

export function mapGpTranscription(
  transcription: GpTranscription,
  options: GpImportOptions = {},
): GpImportResult {
  const createId = options.createId ?? (() => crypto.randomUUID());
  const firstChord = transcription.bars
    .map((bar) => bar.result)
    .find(
      (
        result,
      ): result is Extract<TranscribedBar['result'], { kind: 'chord' }> =>
        result.kind === 'chord',
    );
  const referenceRoot = options.referenceRoot ?? firstChord?.root ?? 0;

  let resolvedBars = 0;
  let uncertainBars = 0;
  let silentBars = 0;

  const steps = transcription.bars.map((bar) => {
    if (bar.result.kind === 'chord') {
      resolvedBars++;
    } else if (bar.result.kind === 'unclear') {
      uncertainBars++;
    } else {
      silentBars++;
    }
    return toStep(bar, referenceRoot);
  });

  return {
    referenceRoot,
    sections: [
      {
        id: createId(),
        type: 'custom',
        customLabel: options.sectionLabel ?? 'Importado',
        steps,
      },
    ],
    resolvedBars,
    uncertainBars,
    silentBars,
  };
}
