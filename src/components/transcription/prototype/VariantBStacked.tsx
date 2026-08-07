// PROTOTYPE variant B — "Stacked": no steps at all. Every control lives on one
// surface and dims until it is relevant. The review is a dense bar grid rather
// than a list, so 206 compassos fit without scrolling. Optimises for seeing the
// whole song at once; costs you hand-holding.

import { NOTE_NAMES } from '@/services/gpFile';
import type { GpImportState } from './useGpImportPrototype';
import type { PreviewRow } from './gpImportPrototypeLogic';

export const variantName = 'Empilhado, tudo numa tela';

export default function VariantBStacked({ s }: { s: GpImportState }) {
  return (
    <div className="flex flex-col gap-4">
      <Row n={1} label="Arquivo" active>
        <label className="inline-flex items-center gap-3 cursor-pointer">
          <span className="px-3 py-1.5 rounded-lg bg-bg-card border border-border-default text-xs text-text-secondary hover:text-text-primary">
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
          {s.gp && (
            <span className="text-xs text-text-muted font-mono">
              {s.gp.masterBarCount} compassos - GP {s.gp.gpVersion}
            </span>
          )}
        </label>
        {s.error && <p className="mt-2 text-xs text-red-400">{s.error}</p>}
      </Row>

      <Row n={2} label="Faixas" active={!!s.gp}>
        {s.gp && (
          <div className="flex flex-col gap-1">
            {s.gp.trackNames.map((t) => (
              <div
                key={t}
                className="flex items-center justify-between gap-3 px-2 py-1.5 rounded bg-bg-card"
              >
                <span className="text-xs text-text-secondary truncate">{t}</span>
                <div className="flex gap-1 shrink-0">
                  <RoleBtn
                    on={s.harmonyTrack === t}
                    onClick={() => s.setHarmonyTrack(t)}
                    label="harmonia"
                  />
                  <RoleBtn
                    on={s.rootTrack === t}
                    onClick={() => s.setRootTrack(t)}
                    label="baixo"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Row>

      <Row n={3} label="Tom" active={!!s.harmonyTrack && !!s.rootTrack}>
        <div className="flex flex-wrap items-center gap-1">
          {NOTE_NAMES.map((n, i) => (
            <button
              key={n}
              onClick={() => s.setKeyRoot(i)}
              className={`px-2 py-1 rounded text-xs font-mono cursor-pointer ${
                s.keyRoot === i ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary'
              }`}
            >
              {n}
            </button>
          ))}
          <span className="w-2" />
          {[false, true].map((m) => (
            <button
              key={String(m)}
              onClick={() => s.setIsMinor(m)}
              className={`px-2 py-1 rounded text-xs cursor-pointer ${
                s.isMinor === m ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary'
              }`}
            >
              {m ? 'menor' : 'maior'}
            </button>
          ))}
        </div>
      </Row>

      <Row n={4} label="Revisao" active={s.rows.length > 0}>
        {s.summary && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3 text-xs">
              <Legend tone="bg-emerald-500" label={`${s.summary.diatonic} no campo`} />
              <Legend tone="bg-sky-500" label={`${s.summary.chromatic} cromaticos`} />
              <Legend tone="bg-amber-500" label={`${s.summary.unclear} incertos`} />
              <Legend tone="bg-neutral-600" label={`${s.summary.noData} sem dados`} />
            </div>
            <div className="flex flex-wrap gap-[3px]">
              {s.rows.map((r) => (
                <span
                  key={r.bar}
                  title={`${r.bar}: ${r.label}${r.carried ? ' (mantido)' : ''}`}
                  className={`w-[10px] h-[10px] rounded-[2px] ${cellTone(r)}`}
                />
              ))}
            </div>
            <button className="self-start px-4 py-2 rounded-lg bg-accent text-white text-xs cursor-pointer">
              Importar {s.summary.total} compassos
            </button>
          </div>
        )}
      </Row>
    </div>
  );
}

function cellTone(r: PreviewRow): string {
  if (r.result.kind === 'no-chord-data') return 'bg-neutral-600';
  if (r.result.kind === 'unclear') return 'bg-amber-500';
  return r.degree !== null ? 'bg-emerald-500' : 'bg-sky-500';
}

function Row({
  n, label, active, children,
}: {
  n: number;
  label: string;
  active: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={active ? '' : 'opacity-40 pointer-events-none'}>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-5 h-5 rounded-full bg-bg-tertiary text-text-muted text-[10px] font-mono flex items-center justify-center">
          {n}
        </span>
        <span className="text-xs font-heading text-text-primary">{label}</span>
      </div>
      <div className="pl-7">{children}</div>
    </div>
  );
}

function RoleBtn({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded text-[10px] cursor-pointer ${
        on ? 'bg-accent text-white' : 'bg-bg-tertiary text-text-muted hover:text-text-secondary'
      }`}
    >
      {label}
    </button>
  );
}

function Legend({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-text-muted">
      <span className={`w-2.5 h-2.5 rounded-[2px] ${tone}`} />
      {label}
    </span>
  );
}
