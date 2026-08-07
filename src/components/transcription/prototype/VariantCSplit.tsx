// PROTOTYPE variant C — "Split": controls in a left rail, the transcription
// permanently visible on the right. The key buttons re-map every bar live, so
// the most consequential choice on the panel is the one you can actually see
// the consequences of. Optimises for judging the key; costs vertical space and
// does not fit a phone.

import { NOTE_NAMES } from '@/services/gpFile';
import type { GpImportState } from './useGpImportPrototype';

export const variantName = 'Dividido, previa ao vivo';

export default function VariantCSplit({ s }: { s: GpImportState }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] gap-4">
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 cursor-pointer">
          <span className="text-[10px] uppercase tracking-wide text-text-muted">
            Arquivo
          </span>
          <span className="px-3 py-2 rounded-lg bg-bg-tertiary border border-border-default text-xs text-text-secondary truncate">
            {s.fileName ?? 'Selecionar .gp'}
          </span>
          <input
            type="file"
            accept=".gp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void s.loadFile(f);
            }}
          />
        </label>

        {s.error && <p className="text-xs text-red-400">{s.error}</p>}

        {s.gp && (
          <>
            <Field label="Harmonia">
              <TrackSelect
                tracks={s.gp.trackNames}
                value={s.harmonyTrack}
                onChange={s.setHarmonyTrack}
              />
            </Field>
            <Field label="Baixo">
              <TrackSelect
                tracks={s.gp.trackNames}
                value={s.rootTrack}
                onChange={s.setRootTrack}
              />
            </Field>
            <Field label="Tom">
              <div className="grid grid-cols-4 gap-1">
                {NOTE_NAMES.map((n, i) => (
                  <button
                    key={n}
                    onClick={() => s.setKeyRoot(i)}
                    className={`px-1 py-1.5 rounded text-[11px] font-mono cursor-pointer ${
                      s.keyRoot === i
                        ? 'bg-accent text-white'
                        : 'bg-bg-tertiary text-text-secondary'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 mt-1">
                {[false, true].map((m) => (
                  <button
                    key={String(m)}
                    onClick={() => s.setIsMinor(m)}
                    className={`flex-1 px-2 py-1.5 rounded text-[11px] cursor-pointer ${
                      s.isMinor === m
                        ? 'bg-accent text-white'
                        : 'bg-bg-tertiary text-text-secondary'
                    }`}
                  >
                    {m ? 'menor' : 'maior'}
                  </button>
                ))}
              </div>
            </Field>
          </>
        )}
      </div>

      <div className="rounded-lg bg-bg-tertiary border border-border-default p-3 min-h-[280px]">
        {s.rows.length === 0 ? (
          <p className="text-xs text-text-muted">
            A previa aparece aqui assim que o arquivo e as faixas forem escolhidos.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {s.summary && (
              <p className="text-xs font-mono text-text-secondary">
                <span className="text-emerald-400">{s.summary.diatonic}</span> no campo{' '}
                <span className="text-sky-400">{s.summary.chromatic}</span> cromaticos{' '}
                <span className="text-amber-400">{s.summary.unclear}</span> incertos{' '}
                <span className="text-text-muted">{s.summary.noData}</span> sem dados
              </p>
            )}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(58px,1fr))] gap-1 max-h-[300px] overflow-y-auto">
              {s.rows.map((r) => (
                <div
                  key={r.bar}
                  title={r.detected ?? (r.carried ? 'mantido do compasso anterior' : '')}
                  className={`px-1.5 py-1 rounded text-center ${
                    r.result.kind === 'unclear'
                      ? 'bg-amber-500/15'
                      : r.result.kind === 'no-chord-data'
                        ? 'bg-bg-card'
                        : r.degree !== null
                          ? 'bg-emerald-500/15'
                          : 'bg-sky-500/15'
                  }`}
                >
                  <div className="text-[9px] text-text-muted font-mono">{r.bar}</div>
                  <div
                    className={`text-[11px] font-mono truncate ${
                      r.carried ? 'text-text-muted italic' : 'text-text-primary'
                    }`}
                  >
                    {r.label}
                  </div>
                </div>
              ))}
            </div>
            <button className="self-start px-4 py-2 rounded-lg bg-accent text-white text-xs cursor-pointer">
              Importar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-text-muted">
        {label}
      </span>
      {children}
    </div>
  );
}

function TrackSelect({
  tracks, value, onChange,
}: {
  tracks: string[];
  value: string | null;
  onChange: (t: string) => void;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="px-2 py-1.5 rounded-lg bg-bg-tertiary border border-border-default text-xs text-text-primary"
    >
      <option value="">Selecione...</option>
      {tracks.map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  );
}
