/**
 * A promise-based stand-in for `window.confirm`, drawn by `ConfirmHost` as a
 * Lighthouse dialog. One request is open at a time: a new one cancels the
 * one before it.
 */
export interface ConfirmRequest {
  title: string;
  /** More detail under the title. */
  message?: string;
  /** The label of the button that says yes. */
  confirmLabel?: string;
  /** The action destroys something: the yes button takes the danger colour. */
  danger?: boolean;
}

interface PendingConfirm extends ConfirmRequest {
  resolve: (confirmed: boolean) => void;
}

let pending: PendingConfirm | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

/** Asks the user and resolves `true` only on an explicit yes. */
export function confirmDialog(request: ConfirmRequest): Promise<boolean> {
  pending?.resolve(false);
  return new Promise((resolve) => {
    pending = { ...request, resolve };
    emit();
  });
}

export function settleConfirm(confirmed: boolean): void {
  const settled = pending;
  if (!settled) return;
  pending = null;
  settled.resolve(confirmed);
  emit();
}

export function subscribeConfirm(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPendingConfirm(): ConfirmRequest | null {
  return pending;
}
