import { motion } from 'framer-motion';
import { Button } from '../../../src/components/ui/button';
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
      <motion.div
        className="dialog dialog-wide"
        role="dialog"
        aria-modal="true"
        aria-label="Edit tab"
        initial={{ opacity: 0, scale: 0.98, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -6 }}
        transition={{ duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}
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
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="default"
            type="button"
            disabled={!title.trim() || !url.trim()}
            onClick={onSave}
          >
            Save
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
