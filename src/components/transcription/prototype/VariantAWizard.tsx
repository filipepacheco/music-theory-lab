// PROTOTYPE variant A — "Wizard": one question at a time, explicit Back/Next,
// nothing on screen that is not the current step. Optimises for never being
// lost; costs you the ability to see earlier choices while making a later one.

import { useState } from 'react';
import { NOTE_NAMES } from '@/services/gpFile';
import type { GpImportState } from './useGpImportPrototype';

const STEPS = ['Arquivo', 'Faixas', 'Tom', 'Revisao'];

export const variantName = 'Wizard, um passo por vez';

export default function VariantAWizard({ s }: { s: GpImportState }) {
  const [step, setStep] = useState(0);
  const at = Math.min(step, s.reachableStep);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs ${
                i === at
                  ? 'bg-accent text-white'
                  : i < at
                    ? 'bg-bg-tertiary text-text-secondary'
                    : 'bg-bg-tertiary text-text-muted'
              }`}
            >
              <span className="font-mono">{i + 1}</span>
              {label}
            </div>
            {i < STEPS.length - 1 && (
              <span className="text-text-muted text-xs">-</span>
            )}
          </div>
        ))}
      </div>

      <div className="min-h-[220px] p-4 rounded-lg bg-bg-tertiary border border-border-default">
        {at === 0 && (
          <label className="flex flex-col items-center justify-center gap-3 h-[190px] cursor-pointer">
            <span className="text-sm text-text-secondary">
              Escolha um arquivo .gp do Guitar Pro 7 ou 8
            </span>
            <span className="px-4 py-2 rounded-lg bg-accent text-white text-sm">
              Selecionar arquivo
            </span>
            <input
              type="file"
              accept=".gp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void s.loadFile(f).then(() => setStep(1));
              }}
            />
            {s.error && (
              <span className="text-xs text-red-400 text-center max-w-sm">
                {s.error}
              </span>
            )}
          </label>
        )}

        {at === 1 && s.gp && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-text-muted">
              {s.fileName} - {s.gp.masterBarCount} compassos
            </p>
            <TrackPick
              label="Faixa de harmonia (os acordes)"
              tracks={s.gp.trackNames}
              value={s.harmonyTrack}
              onChange={s.setHarmonyTrack}
            />
            <TrackPick
              label="Faixa de baixo (a fundamental)"
              tracks={s.gp.trackNames}
              value={s.rootTrack}
              onChange={s.setRootTrack}
            />
          </div>
        )}

        {at === 2 && (
          <KeyPick s={s} />
        )}

        {at === 3 && s.summary && (
          <div className="flex flex-col gap-3">
            <SummaryLine s={s} />
            <div className="max-h-[150px] overflow-y-auto flex flex-col gap-0.5">
              {s.rows.map((r) => (
                <div
                  key={r.bar}
                  className="flex items-center gap-3 text-xs font-mono px-2 py-1 rounded odd:bg-bg-card"
                >
                  <span className="text-text-muted w-10">{r.bar}</span>
                  <span className="text-text-primary w-16">{r.label}</span>
                  <span className="text-text-muted">
                    {r.carried ? '(mantido)' : (r.detected ?? '')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setStep(Math.max(0, at - 1))}
          disabled={at === 0}
          className="px-3 py-2 rounded-lg text-xs bg-bg-tertiary text-text-secondary disabled:opacity-40 cursor-pointer"
        >
          Voltar
        </button>
        <button
          onClick={() => setStep(Math.min(3, at + 1))}
          disabled={at === 3 ? s.rows.length === 0 : at >= s.reachableStep}
          className="px-4 py-2 rounded-lg text-xs bg-accent text-white disabled:opacity-40 cursor-pointer"
        >
          {at === 3 ? 'Importar' : 'Proximo'}
        </button>
      </div>
    </div>
  );
}

function TrackPick({
  label, tracks, value, onChange,
}: {
  label: string;
  tracks: string[];
  value: string | null;
  onChange: (t: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-text-secondary">{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 rounded-lg bg-bg-card border border-border-default text-sm text-text-primary"
      >
        <option value="">Selecione...</option>
        {tracks.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    </div>
  );
}

export function KeyPick({ s }: { s: GpImportState }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs text-text-secondary">Tom da musica</span>
      <div className="grid grid-cols-6 gap-1">
        {NOTE_NAMES.map((n, i) => (
          <button
            key={n}
            onClick={() => s.setKeyRoot(i)}
            className={`px-2 py-2 rounded-lg text-xs font-mono cursor-pointer ${
              s.keyRoot === i
                ? 'bg-accent text-white'
                : 'bg-bg-card text-text-secondary hover:text-text-primary'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        {[false, true].map((m) => (
          <button
            key={String(m)}
            onClick={() => s.setIsMinor(m)}
            className={`flex-1 px-3 py-2 rounded-lg text-xs cursor-pointer ${
              s.isMinor === m
                ? 'bg-accent text-white'
                : 'bg-bg-card text-text-secondary'
            }`}
          >
            {m ? 'menor' : 'maior'}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SummaryLine({ s }: { s: GpImportState }) {
  if (!s.summary) return null;
  const { diatonic, chromatic, unclear, noData, total } = s.summary;
  return (
    <div className="flex flex-wrap gap-2 text-xs font-mono">
      <Tile n={diatonic} label="no campo" tone="text-emerald-400" />
      <Tile n={chromatic} label="cromaticos" tone="text-sky-400" />
      <Tile n={unclear} label="incertos" tone="text-amber-400" />
      <Tile n={noData} label="sem dados" tone="text-text-muted" />
      <span className="px-2 py-1 text-text-muted">de {total} compassos</span>
    </div>
  );
}

function Tile({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <span className="px-2 py-1 rounded bg-bg-card">
      <span className={tone}>{n}</span>{' '}
      <span className="text-text-muted">{label}</span>
    </span>
  );
}
