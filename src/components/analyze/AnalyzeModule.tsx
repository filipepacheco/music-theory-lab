import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IntakeOfflineError,
  fetchHealth,
  fetchJobs,
  isTerminal,
  stageLabel,
  uploadTrack,
  type IntakeHealth,
  type IntakeJob,
  type StageProgress,
} from './intakeClient';

const POLL_INTERVAL_MS = 2000;

export default function AnalyzeModule() {
  const [health, setHealth] = useState<IntakeHealth | null>(null);
  const [offline, setOffline] = useState(false);
  const [jobs, setJobs] = useState<IntakeJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const [nextHealth, nextJobs] = await Promise.all([
        fetchHealth(signal),
        fetchJobs(signal),
      ]);
      setHealth(nextHealth);
      setJobs(nextJobs);
      setOffline(false);
    } catch (err) {
      if (signal?.aborted) return;
      if (err instanceof IntakeOfflineError) setOffline(true);
      else setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  // Poll only while something is actually moving. A finished list is static,
  // and this hits a local process that is busy doing inference.
  const hasPending = jobs.some((job) => !isTerminal(job.status));
  useEffect(() => {
    if (!hasPending && !offline) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      void refresh(controller.signal);
    }, POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [hasPending, offline, refresh]);

  const pickFile = (next: File | null) => {
    setFile(next);
    setError(null);
    if (next && !title) setTitle(next.name.replace(/\.[^.]+$/, ''));
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const job = await uploadTrack({ file, title, artist });
      setJobs((current) => [job, ...current]);
      setFile(null);
      setTitle('');
      setArtist('');
      if (fileInput.current) fileInput.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const blocked = offline || health?.ok === false;

  return (
    <section className="section-panel flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-lg text-text-primary">
          Analisar faixa
        </h2>
        <p className="text-xs text-text-muted">
          Envia um arquivo de áudio para o pipeline local (compassos, acordes,
          tom e trechos) e publica o resultado na Biblioteca. Roda na sua
          máquina — nada é enviado para a internet.
        </p>
      </div>

      {offline && <OfflineNotice />}

      {!offline && health && !health.ok && (
        <p className="text-sm text-amber-400 rounded-button border border-amber-400/30 bg-amber-400/10 px-3 py-2">
          Checkpoints ausentes: {health.missing_checkpoints.join(', ')}. Rode{' '}
          <code className="font-mono text-xs">
            scripts/fetch_checkpoints.py
          </code>{' '}
          antes de analisar.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_1fr] gap-4">
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-text-muted">
              Arquivo
            </span>
            <input
              ref={fileInput}
              type="file"
              accept=".mp3,.m4a,.wav,.flac,.ogg,audio/*"
              disabled={blocked || busy}
              onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
              className="text-xs text-text-secondary file:mr-2 file:rounded-button file:border-0 file:bg-bg-elevated file:px-3 file:py-1.5 file:font-heading file:text-xs file:text-text-primary hover:file:bg-bg-hover file:cursor-pointer disabled:opacity-50"
            />
          </label>

          <Field
            label="Título"
            value={title}
            onChange={setTitle}
            disabled={blocked || busy}
          />
          <Field
            label="Artista"
            value={artist}
            onChange={setArtist}
            disabled={blocked || busy}
          />

          <button
            type="submit"
            disabled={!file || blocked || busy}
            className="font-heading text-sm rounded-button bg-accent px-3 py-2 text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {busy ? 'Enviando…' : 'Analisar'}
          </button>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {health?.ok && (
            <p className="text-[11px] text-text-muted">
              Dispositivo: <span className="font-mono">{health.device}</span>.
              Uma faixa por vez — há só uma GPU.
            </p>
          )}
        </form>

        <div className="flex flex-col gap-2">
          <h3 className="font-heading text-sm text-text-secondary">Fila</h3>
          {jobs.length === 0 ? (
            <p className="text-sm text-text-muted">
              Nenhuma análise ainda nesta sessão.
            </p>
          ) : (
            <ul className="flex flex-col gap-2" role="list">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function OfflineNotice() {
  return (
    <div className="rounded-button border border-border-default bg-bg-card px-3 py-2 flex flex-col gap-1.5">
      <p className="text-sm text-text-secondary">
        O serviço de análise não está rodando.
      </p>
      <p className="text-[11px] text-text-muted">
        Ele é separado do <code className="font-mono">npm run dev</code> porque
        precisa da GPU e dos checkpoints. Em outro terminal, dentro de{' '}
        <code className="font-mono">research/audio-library-poc</code>:
      </p>
      <pre className="text-[11px] font-mono text-text-secondary bg-bg-elevated rounded-button px-2 py-1.5 overflow-x-auto">
        .venv\Scripts\audio-library-intake.exe --workspace workspace --public
        ..\..\public
      </pre>
      <p className="text-[11px] text-text-muted">
        Precisa das extras <code className="font-mono">inference</code> e{' '}
        <code className="font-mono">server</code> instaladas.
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-button border border-border-default bg-bg-card px-2 py-1.5 text-sm text-text-primary disabled:opacity-50"
      />
    </label>
  );
}

const JOB_STATUS_LABEL: Record<IntakeJob['status'], string> = {
  queued: 'Na fila',
  running: 'Analisando',
  succeeded: 'Pronto',
  failed: 'Falhou',
};

function JobCard({ job }: { job: IntakeJob }) {
  return (
    <li className="rounded-button border border-border-default bg-bg-card px-3 py-2 flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium text-text-primary truncate">
          {job.title || job.filename}
        </span>
        <span
          className={`text-[11px] shrink-0 ${
            job.status === 'failed'
              ? 'text-red-400'
              : job.status === 'succeeded'
                ? 'text-text-secondary'
                : 'text-text-muted'
          }`}
        >
          {JOB_STATUS_LABEL[job.status]}
        </span>
      </div>
      {job.artist && (
        <span className="text-xs text-text-secondary">{job.artist}</span>
      )}
      <ul className="flex flex-wrap gap-1" role="list">
        {job.stages.map((stage) => (
          <StageChip key={stage.kind} stage={stage} />
        ))}
      </ul>
      {job.error && <p className="text-[11px] text-red-400">{job.error}</p>}
      {job.status === 'succeeded' && (
        <p className="text-[11px] text-text-muted">
          Publicada na Biblioteca — abra o módulo para ver a cifra.
        </p>
      )}
    </li>
  );
}

const STAGE_TONE: Record<StageProgress['status'], string> = {
  pending: 'border-border-default text-text-muted',
  running: 'border-accent text-text-primary',
  succeeded: 'border-border-default text-text-secondary',
  failed: 'border-red-400/50 text-red-400',
};

function StageChip({ stage }: { stage: StageProgress }) {
  return (
    <li
      title={stage.detail ?? undefined}
      className={`rounded-button border px-2 py-0.5 text-[10px] font-heading ${
        STAGE_TONE[stage.status]
      }`}
    >
      {stageLabel(stage.kind)}
      {stage.status === 'running' && '…'}
      {stage.status === 'succeeded' && ' ✓'}
      {stage.status === 'failed' && ' ✕'}
    </li>
  );
}
