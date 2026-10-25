export interface CollectModalProps {
  isOpen: boolean;
  busy: boolean;
  name: string;
  onNameChange: (name: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function CollectModal({
  isOpen,
  busy,
  name,
  onNameChange,
  onConfirm,
  onClose,
}: CollectModalProps) {
  if (!isOpen) return null;

  return (
    <div className="overlay">
      <button
        className="overlay-backdrop"
        type="button"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Collect open tabs"
      >
        <h2>Collect open tabs</h2>
        <p className="settings-intro">
          Name the new collection for these tabs.
        </p>
        <label className="field">
          <span>Collection name</span>
          <input
            className="input"
            maxLength={120}
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onConfirm();
              }
            }}
          />
        </label>
        <div className="dialog-actions">
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy}
            onClick={onConfirm}
          >
            Collect
          </button>
        </div>
      </div>
    </div>
  );
}
