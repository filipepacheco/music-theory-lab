export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
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
