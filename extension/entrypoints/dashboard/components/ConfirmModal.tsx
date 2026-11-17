import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { Button } from '../../../src/components/ui/button';
import type { ConfirmRequest } from '../types';

export function ConfirmDialog({
  request,
  onCancel,
  onConfirm,
}: {
  request: ConfirmRequest;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelBtnRef.current?.focus();
    return () => {
      previous?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="overlay">
      <button
        className="overlay-backdrop"
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
      />
      <motion.div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={request.title}
        initial={{ opacity: 0, scale: 0.98, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -6 }}
        transition={{ duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}
      >
        <h2>{request.title}</h2>
        <p>{request.body}</p>
        <div className="dialog-actions">
          <Button
            ref={cancelBtnRef}
            variant="ghost"
            type="button"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            variant={request.tone === 'danger' ? 'destructive' : 'default'}
            type="button"
            onClick={onConfirm}
          >
            {request.confirmLabel}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
