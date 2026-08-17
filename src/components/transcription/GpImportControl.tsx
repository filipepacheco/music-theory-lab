import { useState } from 'react';
import { mapGpTranscription } from '@/domain/gpImport';
import {
  defaultTrackNames,
  inspectGp,
  transcribeGp,
  type GpInspection,
} from '@/services/transcribeGp';
import { gpParseErrorMessage } from '@/services/gpFile';
import { useAppStore } from '@/store/useAppStore';

interface ImportSummary {
  resolvedBars: number;
  uncertainBars: number;
  silentBars: number;
}

function fileTitle(fileName: string): string {
  return fileName.replace(/\.gp$/i, '') || 'Transcricao importada';
}

export default function GpImportControl() {
  const loadImportedSong = useAppStore((state) => state.loadImportedSong);
  const [inspection, setInspection] = useState<GpInspection | null>(null);
  const [fileName, setFileName] = useState('');
  const [harmonyTrackName, setHarmonyTrackName] = useState('');
  const [rootTrackName, setRootTrackName] = useState('');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const trackNames = inspection?.trackNames ?? [];

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsReading(true);
    setError(null);
    setSummary(null);
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const nextInspection = inspectGp(data);
      if (nextInspection.trackNames.length === 0) {
        throw new Error('O arquivo nao possui faixas para analisar.');
      }

      const defaults = defaultTrackNames(nextInspection.trackNames);

      setInspection(nextInspection);
      setFileName(file.name);
      setHarmonyTrackName(defaults.harmonyTrackName);
      setRootTrackName(defaults.rootTrackName);
    } catch (readError) {
      setInspection(null);
      setFileName('');
      setError(gpParseErrorMessage(readError));
    } finally {
      setIsReading(false);
    }
  };

  const handleImport = () => {
    if (!inspection || !harmonyTrackName || !rootTrackName) return;

    setIsImporting(true);
    setError(null);
    try {
      const transcription = transcribeGp(inspection, {
        harmonyTrackName,
        rootTrackName,
      });
      const imported = mapGpTranscription(transcription, {
        sectionLabel: fileTitle(fileName),
      });

      loadImportedSong({
        title: fileTitle(fileName),
        artist: '',
        key: imported.referenceRoot,
        sections: imported.sections,
      });
      setSummary({
        resolvedBars: imported.resolvedBars,
        uncertainBars: imported.uncertainBars,
        silentBars: imported.silentBars,
      });
    } catch (importError) {
      setError(gpParseErrorMessage(importError));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border-default bg-bg-tertiary/40 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-heading text-xs text-text-secondary">
            Importar Guitar Pro
          </h3>
          <p className="text-[10px] text-text-muted mt-1">
            GP7 (.gp): uma faixa de harmonia e uma faixa raiz por compasso.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-accent/40 text-xs text-accent hover:bg-accent/10 transition-colors cursor-pointer">
          <span>{isReading ? 'Lendo...' : 'Escolher arquivo .gp'}</span>
          <input
            type="file"
            accept=".gp,application/octet-stream"
            onChange={handleFileChange}
            disabled={isReading || isImporting}
            className="sr-only"
          />
        </label>
      </div>

      {trackNames.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs text-text-secondary">
            <span className="font-medium text-text-primary">{fileName}</span> ·{' '}
            {inspection?.masterBarCount} compassos
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="block text-[10px] text-text-muted">
                Faixa de harmonia
              </span>
              <select
                value={harmonyTrackName}
                onChange={(event) => setHarmonyTrackName(event.target.value)}
                className="w-full px-2.5 py-2 rounded-lg bg-bg-card border border-border-default text-xs text-text-primary focus:outline-none focus:border-accent"
              >
                {trackNames.map((track) => (
                  <option key={track} value={track}>
                    {track}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-[10px] text-text-muted">
                Faixa raiz / baixo
              </span>
              <select
                value={rootTrackName}
                onChange={(event) => setRootTrackName(event.target.value)}
                className="w-full px-2.5 py-2 rounded-lg bg-bg-card border border-border-default text-xs text-text-primary focus:outline-none focus:border-accent"
              >
                {trackNames.map((track) => (
                  <option key={track} value={track}>
                    {track}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleImport}
              disabled={isImporting}
              className="px-4 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isImporting ? 'Importando...' : 'Carregar transcricao'}
            </button>
            <span className="text-[10px] text-text-muted">
              {inspection?.chordDictionaryFound
                ? 'O arquivo possui nomes de acordes anotados; a analise por notas continua disponivel.'
                : 'Os acordes serao inferidos pelas notas das faixas selecionadas.'}
            </span>
          </div>
        </div>
      )}

      {summary && (
        <p className="text-xs text-emerald-400">
          Importado: {summary.resolvedBars} acordes, {summary.uncertainBars}{' '}
          compassos incertos e {summary.silentBars} sem dados. O tom de
          referencia foi definido pelo primeiro acorde; ajuste-o se necessario.
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
