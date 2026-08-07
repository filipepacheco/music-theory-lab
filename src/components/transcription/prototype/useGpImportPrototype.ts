// PROTOTYPE — throwaway. Shared state for the three import-panel variants, so
// each one is free to disagree about layout without re-solving the plumbing.

import { useCallback, useMemo, useState } from 'react';
import { parseGpFile, GpParseError, type GpFile } from '@/services/gpFile';
import {
  buildPreview,
  summarise,
  ERROR_MESSAGE,
  type PreviewRow,
  type PreviewSummary,
} from './gpImportPrototypeLogic';

export interface GpImportState {
  fileName: string | null;
  gp: GpFile | null;
  error: string | null;
  harmonyTrack: string | null;
  rootTrack: string | null;
  keyRoot: number;
  isMinor: boolean;
  rows: PreviewRow[];
  summary: PreviewSummary | null;
  /** Furthest step reachable given what has been chosen: 0-3. */
  reachableStep: number;
  loadFile: (file: File) => Promise<void>;
  setHarmonyTrack: (t: string) => void;
  setRootTrack: (t: string) => void;
  setKeyRoot: (n: number) => void;
  setIsMinor: (m: boolean) => void;
  reset: () => void;
}

export function useGpImportPrototype(): GpImportState {
  const [fileName, setFileName] = useState<string | null>(null);
  const [gp, setGp] = useState<GpFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [harmonyTrack, setHarmonyTrack] = useState<string | null>(null);
  const [rootTrack, setRootTrack] = useState<string | null>(null);
  const [keyRoot, setKeyRoot] = useState(0);
  const [isMinor, setIsMinor] = useState(false);

  const reset = useCallback(() => {
    setFileName(null);
    setGp(null);
    setError(null);
    setHarmonyTrack(null);
    setRootTrack(null);
  }, []);

  const loadFile = useCallback(async (file: File) => {
    setError(null);
    setGp(null);
    setHarmonyTrack(null);
    setRootTrack(null);
    setFileName(file.name);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = parseGpFile(bytes);
      setGp(parsed);
      // Pre-select nothing: which track is harmony is the user's call, and a
      // wrong default is likelier to be accepted than corrected.
    } catch (e) {
      setGp(null);
      setError(
        e instanceof GpParseError
          ? (ERROR_MESSAGE[e.kind] ?? e.message)
          : 'Não foi possível ler o arquivo.',
      );
    }
  }, []);

  const rows = useMemo(() => {
    if (!gp || !harmonyTrack || !rootTrack) return [];
    return buildPreview(gp, harmonyTrack, rootTrack, keyRoot, isMinor);
  }, [gp, harmonyTrack, rootTrack, keyRoot, isMinor]);

  const summary = useMemo(
    () => (rows.length > 0 ? summarise(rows) : null),
    [rows],
  );

  const reachableStep = !gp ? 0 : !harmonyTrack || !rootTrack ? 1 : rows.length > 0 ? 3 : 2;

  return {
    fileName, gp, error, harmonyTrack, rootTrack, keyRoot, isMinor,
    rows, summary, reachableStep,
    loadFile, setHarmonyTrack, setRootTrack, setKeyRoot, setIsMinor, reset,
  };
}
