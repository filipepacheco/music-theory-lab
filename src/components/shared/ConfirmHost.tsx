import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  getPendingConfirm,
  settleConfirm,
  subscribeConfirm,
} from '@/services/confirm';
import Button from '@/components/shared/Button';

export default function ConfirmHost() {
  const request = useSyncExternalStore(subscribeConfirm, getPendingConfirm);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (request && !dialog.open) dialog.showModal();
    if (!request && dialog.open) dialog.close();
  }, [request]);

  return (
    <dialog
      ref={dialogRef}
      className="lh-dialog m-auto w-[min(52ch,calc(100vw-32px))] overflow-hidden"
      onClose={() => settleConfirm(false)}
      onClick={(event) => {
        if (event.target === event.currentTarget) settleConfirm(false);
      }}
    >
      {request && (
        <>
          <div className="lh-dialog-head">
            <h2 className="lh-dialog-title">{request.title}</h2>
          </div>
          <div className="lh-dialog-body flex flex-col gap-4">
            {request.message && (
              <p className="text-ui text-text-secondary">{request.message}</p>
            )}
            <div className="flex justify-end gap-[1ch]">
              <Button onClick={() => settleConfirm(false)}>Cancelar</Button>
              <Button
                variant="primary"
                className={request.danger ? 'bg-danger' : undefined}
                onClick={() => settleConfirm(true)}
              >
                {request.confirmLabel ?? 'Confirmar'}
              </Button>
            </div>
          </div>
        </>
      )}
    </dialog>
  );
}
