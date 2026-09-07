/**
 * Client for the local intake service (`audio-library-intake`).
 *
 * Everything here talks to `/intake`, which the Vite dev server proxies to
 * 127.0.0.1:8756. That prefix is deliberately not `/api` — `/api` is already
 * proxied to the deployed Vercel sync endpoints. Nothing proxies `/intake` in
 * a production build, and the module that uses this is dev-gated, so these
 * calls only ever resolve on a machine running the service.
 */

const INTAKE_ROOT = '/intake';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type StageStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export interface StageProgress {
  kind: string;
  status: StageStatus;
  detail: string | null;
}

export interface IntakeJob {
  id: string;
  slug: string;
  title: string;
  artist: string;
  filename: string;
  source_sha256: string;
  status: JobStatus;
  error: string | null;
  created_at: string;
  finished_at: string | null;
  stages: StageProgress[];
}

export interface IntakeHealth {
  ok: boolean;
  workspace: string;
  public: string;
  /** Where results actually land: `<public>/library`. */
  library_root: string;
  device: string;
  missing_checkpoints: string[];
  stages: string[];
}

/** Thrown when the service answered but refused the request. */
export class IntakeRequestError extends Error {}

/** Thrown when the service could not be reached at all. */
export class IntakeOfflineError extends Error {}

/** A job is done when it will never change again. */
export function isTerminal(status: JobStatus): boolean {
  return status === 'succeeded' || status === 'failed';
}

/** Portuguese label for a stage kind, for the progress list. */
export function stageLabel(kind: string): string {
  switch (kind) {
    case 'beat.beat_this':
      return 'Compassos';
    case 'chord.chordmini_btc':
      return 'Acordes';
    case 'key.hpcp':
      return 'Tom';
    case 'section.librosa_segment':
      return 'Trechos';
    default:
      return kind;
  }
}

/**
 * Statuses the dev-server proxy produces when nothing is listening on the
 * target. Vite answers a dead upstream with a 500 rather than failing the
 * fetch, so "service is down" arrives here as an ordinary response and has
 * to be told apart from a real error the service itself reported.
 */
const PROXY_FAILURE_STATUSES = new Set([500, 502, 503, 504]);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${INTAKE_ROOT}${path}`, init);
  } catch {
    // No proxy in front of us, or the browser refused the connection.
    throw new IntakeOfflineError('serviço de análise não está rodando');
  }
  if (!response.ok) throw await failureFor(response);
  return (await response.json()) as T;
}

/**
 * Decide whether a failed response came from the service or from the gap
 * where the service should be.
 *
 * Anything the service rejects carries FastAPI's `{detail: "..."}`. A proxy
 * error carries a plain-text or HTML body instead, so an unparseable body on
 * a gateway-shaped status means nothing is listening.
 */
async function failureFor(response: Response): Promise<Error> {
  const detail = await readDetail(response);
  if (detail !== null) return new IntakeRequestError(detail);
  if (PROXY_FAILURE_STATUSES.has(response.status)) {
    return new IntakeOfflineError('serviço de análise não está rodando');
  }
  return new IntakeRequestError(`HTTP ${response.status}`);
}

/** FastAPI's error message, or null if this is not one of its responses. */
async function readDetail(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      'detail' in body &&
      typeof (body as { detail: unknown }).detail === 'string'
    ) {
      return (body as { detail: string }).detail;
    }
    return null;
  } catch {
    return null;
  }
}

export function fetchHealth(signal?: AbortSignal): Promise<IntakeHealth> {
  return request<IntakeHealth>('/health', { signal });
}

export async function fetchJobs(signal?: AbortSignal): Promise<IntakeJob[]> {
  const body = await request<{ jobs: IntakeJob[] }>('/jobs', { signal });
  return body.jobs;
}

export function fetchJob(id: string, signal?: AbortSignal): Promise<IntakeJob> {
  return request<IntakeJob>(`/jobs/${encodeURIComponent(id)}`, { signal });
}

export interface UploadRequest {
  file: File;
  title: string;
  artist: string;
  segmentCount: number;
}

export function uploadTrack(
  { file, title, artist, segmentCount }: UploadRequest,
  signal?: AbortSignal,
): Promise<IntakeJob> {
  const form = new FormData();
  form.append('file', file);
  form.append('title', title);
  form.append('artist', artist);
  form.append('segment_count', String(segmentCount));
  return request<IntakeJob>('/tracks', {
    method: 'POST',
    body: form,
    signal,
  });
}
