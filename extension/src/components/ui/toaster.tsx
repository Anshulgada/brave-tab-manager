import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      richColors
      closeButton
      theme="system"
      toastOptions={{
        style: {
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          borderRadius: 'var(--radius-md)',
          fontSize: '13px',
          boxShadow: 'var(--shadow-md)',
        },
        className: 'font-sans',
      }}
    />
  );
}

export { toast } from 'sonner';
