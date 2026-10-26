import { useEffect } from 'react';
import {
  CloseIcon,
  FolderIcon,
  GridIcon,
  HelpIcon,
  LayersIcon,
  RestoreIcon,
  WindowIcon,
  ZapIcon,
} from '../../../src/ui/icons';

export function HelpDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="overlay">
      <button
        className="overlay-backdrop"
        type="button"
        aria-label="Close help"
        onClick={onClose}
      />
      <div
        className="dialog help-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Tabman Guide & Concepts"
      >
        <div className="dialog-head">
          <div className="dialog-title">
            <HelpIcon size={18} />
            <h2>Tabman Guide & Concepts</h2>
          </div>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon size={14} />
          </button>
        </div>
        <div className="help-modal-body">
          <div className="help-grid">
            <article className="help-topic">
              <div className="help-topic-head">
                <WindowIcon size={16} />
                <h3>Park Window</h3>
              </div>
              <p>
                Saves all open tabs from a specific browser window into a
                collection and closes that window in your browser to free up
                system RAM.
              </p>
            </article>

            <article className="help-topic">
              <div className="help-topic-head">
                <ZapIcon size={16} />
                <h3>Collect Tabs</h3>
              </div>
              <p>
                Takes a snapshot of every open tab across all windows and saves
                them into a collection without closing any of your browser
                windows.
              </p>
            </article>

            <article className="help-topic">
              <div className="help-topic-head">
                <LayersIcon size={16} />
                <h3>Local Rules vs AI</h3>
              </div>
              <p>
                <strong>Local Rules:</strong> Offline domain/path pattern
                matching.
                <br />
                <strong>AI Provider:</strong> Uses your OpenAI/Anthropic/custom
                LLM key to group tabs semantically.
              </p>
            </article>

            <article className="help-topic">
              <div className="help-topic-head">
                <FolderIcon size={16} />
                <h3>Single vs Multiple Collections</h3>
              </div>
              <p>
                Choose whether organization proposals create separate
                collections per category or group everything into one collection
                using tags.
              </p>
            </article>

            <article className="help-topic">
              <div className="help-topic-head">
                <GridIcon size={16} />
                <h3>Kanban Board Preview</h3>
              </div>
              <p>
                Preview organization proposals on an interactive drag-and-drop
                board. Move tabs between columns, collapse columns, or add
                custom groups before saving.
              </p>
            </article>

            <article className="help-topic">
              <div className="help-topic-head">
                <RestoreIcon size={16} />
                <h3>Restore Tabs</h3>
              </div>
              <p>
                Reopen entire collections or selected tabs in new windows with
                one click, restoring your saved sessions anytime.
              </p>
            </article>
          </div>
        </div>
        <div className="dialog-actions">
          <button className="btn btn-primary" type="button" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
