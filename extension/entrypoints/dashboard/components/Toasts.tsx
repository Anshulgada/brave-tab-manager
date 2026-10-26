import { AnimatePresence, motion } from 'framer-motion';
import { CheckIcon, CloseIcon } from '../../../src/ui/icons';
import type { Toast } from '../types';

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <section className="toast-stack" aria-label="Notifications">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            className={`toast toast-${toast.tone}`}
            key={toast.id}
            role="status"
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ duration: 0.2 }}
          >
            <span className="toast-mark" aria-hidden="true">
              {toast.tone === 'danger' ? (
                <CloseIcon size={13} />
              ) : (
                <CheckIcon size={13} />
              )}
            </span>
            <span>{toast.message}</span>
            <button
              className="btn btn-ghost btn-icon btn-sm"
              type="button"
              aria-label="Dismiss"
              onClick={() => onDismiss(toast.id)}
            >
              <CloseIcon size={13} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </section>
  );
}
