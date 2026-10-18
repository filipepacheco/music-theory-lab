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
import Frame from '@/components/shared/Frame';
import Button from '@/components/shared/Button';
import Callout from '@/components/shared/Callout';

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
    <Frame
      as="section"
      title="Analisar faixa"
      titleAs="h2"
      className="flex flex-col gap-4"
    >
      <p className="text-xs text-text-muted">
        Envia um arquivo de áudio para o pipeline local (compassos, acordes, tom
        e trechos) e publica o resultado na Biblioteca. Roda na sua máquina —
        nada é enviado para a internet.
      </p>

      {offline && <OfflineNotice />}

      {!offline && health && !health.ok && (
        <Callout tone="warning" className="my-0">
          Checkpoints ausentes: {health.missing_checkpoints.join(', ')}. Rode{' '}
          <code>scripts/fetch_checkpoints.py</code> antes de analisar.
        </Callout>
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
            <span className="lh-label">Arquivo</span>
            <input
              ref={fileInput}
              type="file"
              accept=".mp3,.m4a,.wav,.flac,.ogg,audio/*"
              disabled={blocked || busy}
              onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
              className="text-xs text-text-secondary file:mr-2 file:border-0 file:bg-bg-tertiary file:px-3 file:py-1.5 file:font-heading file:text-xs file:text-text-primary hover:file:bg-accent hover:file:text-on-accent file:cursor-pointer disabled:opacity-50"
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

          <Button
            type="submit"
            disabled={!file || blocked || busy}
            variant="primary"
            className="self-start"
          >
            {busy ? 'Enviando…' : 'Analisar'}
          </Button>

          {error && <p className="text-xs text-danger">{error}</p>}

          {health?.ok && (
            <p className="text-small text-text-muted">
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
    </Frame>
  );
}

function OfflineNotice() {
  return (
    <div className="border border-border-default bg-bg-card px-3 py-2 flex flex-col gap-1.5">
      <p className="text-sm text-text-secondary">
        O serviço de análise não está rodando.
      </p>
      <p className="text-small text-text-muted">
        Ele é separado do <code className="font-mono">npm run dev</code> porque
        precisa da GPU e dos checkpoints. Em outro terminal, dentro de{' '}
        <code className="font-mono">research/audio-library-poc</code>:
      </p>
      <pre className="text-small font-mono text-text-secondary bg-bg-tertiary px-2 py-1.5 overflow-x-auto">
        .venv\Scripts\audio-library-intake.exe --workspace workspace --public
        ..\..\public
      </pre>
      <p className="text-small text-text-muted">
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
      <span className="lh-label">{label}</span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="lh-input disabled:opacity-50"
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
    <li className="border border-border-default bg-bg-card px-3 py-2 flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium text-text-primary truncate">
          {job.title || job.filename}
        </span>
        <span
          className={`text-small shrink-0 ${
            job.status === 'failed'
              ? 'text-danger'
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
      {job.error && <p className="text-small text-danger">{job.error}</p>}
      {job.status === 'succeeded' && (
        <p className="text-small text-text-muted">
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
  failed: 'border-danger/50 text-danger',
};

function StageChip({ stage }: { stage: StageProgress }) {
  return (
    <li
      title={stage.detail ?? undefined}
      className={`border px-2 py-0.5 text-micro font-heading ${
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
