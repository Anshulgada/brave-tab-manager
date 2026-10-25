export interface EditCollectionModalProps {
  isOpen: boolean;
  name: string;
  onNameChange: (val: string) => void;
  description: string;
  onDescriptionChange: (val: string) => void;
  color: string;
  onColorChange: (val: string) => void;
  onSave: () => void;
  onClose: () => void;
}

const SWATCH_COLORS = [
  '',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];

export function EditCollectionModal({
  isOpen,
  name,
  onNameChange,
  description,
  onDescriptionChange,
  color,
  onColorChange,
  onSave,
  onClose,
}: EditCollectionModalProps) {
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
        className="dialog dialog-wide"
        role="dialog"
        aria-modal="true"
        aria-label="Edit collection"
      >
        <h2>Edit collection</h2>
        <label className="field">
          <span>Name</span>
          <input
            className="input"
            maxLength={120}
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea
            className="input"
            rows={3}
            maxLength={500}
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
          />
        </label>
        <div className="field">
          <span>Color</span>
          <div className="color-swatches">
            {SWATCH_COLORS.map((c) => (
              <button
                key={c || 'none'}
                type="button"
                className={
                  color === c ? 'color-swatch selected' : 'color-swatch'
                }
                style={c ? { background: c } : undefined}
                aria-label={c || 'No color'}
                onClick={() => onColorChange(c)}
              />
            ))}
          </div>
        </div>
        <div className="dialog-actions">
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!name.trim()}
            onClick={onSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
