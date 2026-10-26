import type { TabRecord } from '../../../src/database';

export interface EditTabModalProps {
  tab: TabRecord | undefined;
  title: string;
  onTitleChange: (val: string) => void;
  url: string;
  onUrlChange: (val: string) => void;
  onSave: () => void;
  onClose: () => void;
}

export function EditTabModal({
  tab,
  title,
  onTitleChange,
  url,
  onUrlChange,
  onSave,
  onClose,
}: EditTabModalProps) {
  if (!tab) return null;

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
        aria-label="Edit tab"
      >
        <h2>Edit tab</h2>
        <label className="field">
          <span>Title</span>
          <input
            className="input"
            maxLength={240}
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
          />
        </label>
        <label className="field">
          <span>URL</span>
          <input
            className="input"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
          />
        </label>
        <div className="dialog-actions">
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!title.trim() || !url.trim()}
            onClick={onSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
