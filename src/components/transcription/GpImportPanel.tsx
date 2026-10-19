import { importFormat } from '@/domain/importFormat';
import Callout from '@/components/shared/Callout';
import { memo, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';
import { useSongs } from '@/hooks/useSongs';
import { NOTE_NAMES } from '@/constants/notes';
import { getPreferredRootName } from '@/utils/noteHelpers';
import {
  GpParseError,
  gpParseErrorMessage,
  parseGpFile,
  type GpFile,
} from '@/services/gpFile';
import {
  analyzeBars,
  assembleSections,
  summarise,
  type ImportedBar,
} from '@/services/gpImport';
import Button from '@/components/shared/Button';
import Select from '@/components/shared/Select';
import { confirmDialog } from '@/services/confirm';

export default function GpImportPanel() {
  const rootNote = useAppStore((s) => s.rootNote);
  const storeIsMinor = useAppStore((s) => s.isMinor);
  const bpm = useAppStore((s) => s.bpm);
  const activePresetId = useAppStore((s) => s.activePresetId);
  const activeSongId = useAppStore((s) => s.activeSongId);
  const songTitle = useAppStore((s) => s.songTitle);
  const songArtist = useAppStore((s) => s.songArtist);
  const songSections = useAppStore((s) => s.songSections);
  const loadSong = useAppStore((s) => s.loadSong);

  const { songs, save } = useSongs();

  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [gp, setGp] = useState<GpFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [harmonyTrack, setHarmonyTrack] = useState<string | null>(null);
  const [rootTrack, setRootTrack] = useState<string | null>(null);
  const [keyRoot, setKeyRoot] = useState(rootNote);
  const [isMinor, setIsMinor] = useState(storeIsMinor);
  const [importing, setImporting] = useState(false);

  const bars = useMemo<ImportedBar[]>(
    () =>
      gp && harmonyTrack && rootTrack
        ? analyzeBars(gp, harmonyTrack, rootTrack, keyRoot, isMinor)
        : [],
    [gp, harmonyTrack, rootTrack, keyRoot, isMinor],
  );

  const summary = useMemo(
    () => (bars.length > 0 ? summarise(bars) : null),
    [bars],
  );

  const dirty = useMemo(() => {
    if (!activeSongId) {
      return songSections.length > 0 || songTitle.trim() !== '';
    }
    const saved = songs.find((s) => s.id === activeSongId);
    if (!saved) return songSections.length > 0;
    return (
      saved.title !== songTitle ||
      saved.artist !== songArtist ||
      saved.key !== rootNote ||
      saved.mode !== (storeIsMinor ? 'minor' : 'major') ||
      saved.originalBpm !== bpm ||
      saved.presetId !== activePresetId ||
      JSON.stringify(saved.sections) !== JSON.stringify(songSections)
    );
  }, [
    activeSongId,
    songs,
    songTitle,
    songArtist,
    songSections,
    rootNote,
    storeIsMinor,
    bpm,
    activePresetId,
  ]);

  const reset = () => {
    setFileName(null);
    setGp(null);
    setError(null);
    setHarmonyTrack(null);
    setRootTrack(null);
  };

  const handleFile = async (file: File) => {
    setError(null);
    setGp(null);
    setHarmonyTrack(null);
    setRootTrack(null);
    setFileName(file.name);
    setKeyRoot(rootNote);
    setIsMinor(storeIsMinor);
    if (importFormat(file.name) !== 'gp') {
      setError('Selecione um arquivo Guitar Pro 7/8 (.gp).');
      return;
    }
    try {
      const parsed = parseGpFile(new Uint8Array(await file.arrayBuffer()));
      setGp(parsed);
    } catch (e) {
      const message =
        e instanceof GpParseError
          ? gpParseErrorMessage(e)
          : 'Não foi possível ler o arquivo.';
      setError(`${message} Selecione um arquivo Guitar Pro 7/8 (.gp).`);
    }
  };

  const handleImport = async () => {
    if (!gp || bars.length === 0 || importing) return;
    if (
      dirty &&
      !(await confirmDialog({
        title: 'Substituir a transcrição aberta?',
        message:
          'A transcrição aberta tem alterações não salvas. Importar cria uma música nova e substitui a que está aberta.',
        confirmLabel: 'Importar',
        danger: true,
      }))
    ) {
      return;
    }

    setImporting(true);
    setError(null);
    try {
      const data = {
        title:
          gp.title || (fileName ?? '').replace(/\.gp$/i, '') || 'Sem título',
        artist: gp.artist,
        key: keyRoot,
        mode: (isMinor ? 'minor' : 'major') as 'major' | 'minor',
        originalBpm: bpm,
        presetId: activePresetId,
        sections: assembleSections(bars),
      };
      const id = await save(data);
      if (!id) throw new Error('no id');
      const now = new Date().toISOString();
      loadSong({ id, ...data, createdAt: now, updatedAt: now });
      setOpen(false);
      reset();
    } catch {
      setError('Erro ao salvar a música importada.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="border border-border-default bg-bg-tertiary/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer"
      >
        <span className="text-sm font-heading text-text-primary">
          Importar do Guitar Pro
        </span>
        <span className="text-xs text-text-muted">
          {open ? 'Fechar' : 'Abrir'}
        </span>
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
        >
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] gap-4 p-4 pt-0">
            <div className="flex flex-col gap-4">
              <Field label="Arquivo">
                <label className="block cursor-pointer">
                  <span className="block px-3 py-2 bg-bg-card border border-border-default text-xs text-text-secondary truncate hover:text-text-primary">
                    {fileName ?? 'Selecionar .gp'}
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleFile(f);
                      e.target.value = '';
                    }}
                  />
                </label>
                {gp && (
                  <span className="text-micro font-mono text-text-muted">
                    {gp.masterBarCount} compassos - GP {gp.gpVersion}
                  </span>
                )}
              </Field>

              {error && (
                <Callout tone="danger" role="alert">
                  {error}
                </Callout>
              )}

              {gp && (
                <>
                  <Field label="Faixa de harmonia">
                    <TrackSelect
                      tracks={gp.trackNames}
                      value={harmonyTrack}
                      onChange={setHarmonyTrack}
                    />
                  </Field>
                  <Field label="Faixa de baixo">
                    <TrackSelect
                      tracks={gp.trackNames}
                      value={rootTrack}
                      onChange={setRootTrack}
                    />
                  </Field>
                  <Field label="Tom">
                    <div className="grid grid-cols-4 gap-1">
                      {NOTE_NAMES.map((n, i) => (
                        <PillButton
                          key={n}
                          active={keyRoot === i}
                          onClick={() => setKeyRoot(i)}
                          className="px-1 py-1.5 text-small font-mono"
                        >
                          {getPreferredRootName(i)}
                        </PillButton>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      {[false, true].map((m) => (
                        <PillButton
                          key={String(m)}
                          active={isMinor === m}
                          onClick={() => setIsMinor(m)}
                          className="flex-1 px-2 py-1.5 text-small"
                        >
                          {m ? 'menor' : 'maior'}
                        </PillButton>
                      ))}
                    </div>
                  </Field>
                </>
              )}
            </div>

            <div className="bg-bg-card border border-border-default p-3 min-h-[240px]">
              {bars.length === 0 ? (
                <p className="text-xs text-text-muted">
                  A previa aparece aqui assim que o arquivo e as duas faixas
                  forem escolhidos. Trocar o tom recalcula todos os compassos.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {summary && (
                    <p className="text-xs font-mono text-text-secondary">
                      <span className="text-success">{summary.diatonic}</span>{' '}
                      no campo{' '}
                      <span className="text-accent">{summary.chromatic}</span>{' '}
                      cromáticos{' '}
                      <span className="text-warning">{summary.unclear}</span>{' '}
                      incertos{' '}
                      <span className="text-text-muted">{summary.noData}</span>{' '}
                      sem dados
                    </p>
                  )}

                  <div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-1 max-h-[300px] overflow-y-auto">
                    {bars.map((b) => (
                      <BarCell key={b.bar} bar={b} />
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      onClick={handleImport}
                      disabled={importing}
                      variant="primary"
                    >
                      {importing
                        ? 'Importando...'
                        : `Importar ${bars.length} compassos`}
                    </Button>
                    <span className="text-micro text-text-muted">
                      Cria uma música nova em partes de 64 compassos.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

const BarCell = memo(function BarCell({ bar }: { bar: ImportedBar }) {
  const tone =
    bar.result.kind === 'unclear'
      ? 'bg-warning/15'
      : bar.result.kind === 'no-chord-data'
        ? 'bg-bg-tertiary'
        : bar.step.degree !== null
          ? 'bg-success/15'
          : 'ring-1 ring-inset ring-accent';

  return (
    <div className={`px-1.5 py-1 text-center ${tone}`}>
      <div className="text-micro font-mono text-text-muted">{bar.bar}</div>
      <div
        className={`text-small font-mono truncate ${
          bar.carried ? 'text-text-muted italic' : 'text-text-primary'
        }`}
      >
        {bar.step.label}
      </div>
      {(bar.detected || bar.carried) && (
        <p className="text-meta text-text-muted">
          {bar.detected ?? 'mantido do compasso anterior'}
        </p>
      )}
    </div>
  );
});

function PillButton({
  active,
  onClick,
  children,
  className = '',
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`lh-tab justify-center ${className}`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="lh-label">{label}</span>
      {children}
    </div>
  );
}

function TrackSelect({
  tracks,
  value,
  onChange,
}: {
  tracks: string[];
  value: string | null;
  onChange: (t: string) => void;
}) {
  return (
    <Select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">Selecione...</option>
      {tracks.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </Select>
  );
}
