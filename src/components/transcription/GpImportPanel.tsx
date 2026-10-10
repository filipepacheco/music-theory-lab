// Imports a Guitar Pro `.gp` file as a new Song. Split layout: controls on the
// left, the transcription that would be produced permanently visible on the
// right - so the key, the one input nobody can verify on its own, is chosen
// while watching it re-map every bar.
//
// Shape decided on https://github.com/filipepacheco/music-theory-lab/issues/14.

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

  // Without a dirty flag in the store, compare against what was persisted.
  // Cheap, exact, and it avoids nagging when nothing has actually changed.
  // Every field the editor can change counts, including key/mode/BPM/preset —
  // the import replaces the whole open song.
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
    // Re-seed from the app's current key here, not at mount: the panel is
    // mounted for the whole session, so a key chosen after it mounted - by
    // opening a saved song, say - would otherwise never reach it.
    setKeyRoot(rootNote);
    setIsMinor(storeIsMinor);
    try {
      const parsed = parseGpFile(new Uint8Array(await file.arrayBuffer()));
      setGp(parsed);
    } catch (e) {
      setError(
        e instanceof GpParseError
          ? gpParseErrorMessage(e)
          : 'Não foi possível ler o arquivo.',
      );
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

      {/* Enter-only, and deliberately not wrapped in AnimatePresence. An exit
          animation keeps the old children mounted while it runs, and this body
          holds 206 focusable cells; if the animation is ever interrupted - a
          backgrounded tab throttling rAF is enough - they are stranded in the
          DOM at opacity 0. Closing here unmounts immediately. */}
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
                    accept=".gp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleFile(f);
                      e.target.value = '';
                    }}
                  />
                </label>
                {gp && (
                  <span className="text-[10px] font-mono text-text-muted">
                    {gp.masterBarCount} compassos - GP {gp.gpVersion}
                  </span>
                )}
              </Field>

              {error && <p className="text-xs text-danger">{error}</p>}

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
                          className="px-1 py-1.5 text-[11px] font-mono"
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
                          className="flex-1 px-2 py-1.5 text-[11px]"
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
                      <span className="text-success">
                        {summary.diatonic}
                      </span>{' '}
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
                    <span className="text-[10px] text-text-muted">
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
          : 'bg-accent/15';

  return (
    <div
      title={
        bar.detected ?? (bar.carried ? 'mantido do compasso anterior' : '')
      }
      className={`px-1.5 py-1 text-center ${tone}`}
    >
      <div className="text-[9px] font-mono text-text-muted">{bar.bar}</div>
      <div
        className={`text-[11px] font-mono truncate ${
          bar.carried ? 'text-text-muted italic' : 'text-text-primary'
        }`}
      >
        {bar.step.label}
      </div>
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
