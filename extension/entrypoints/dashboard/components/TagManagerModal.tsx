import { useState } from 'react';
import type { LibraryCollection } from '../../../src/library';
import { PencilIcon, PlusIcon, TrashIcon } from '../../../src/ui/icons';

const ALL_SWATCH_COLORS = [
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

export interface TagManagerModalProps {
  isOpen: boolean;
  collection: LibraryCollection;
  onClose: () => void;
  onCreateTag: (name: string, color: string | null) => Promise<void>;
  onUpdateTag: (
    tagId: string,
    name: string,
    color: string | null,
  ) => Promise<void>;
  onDeleteTag: (tagId: string) => Promise<void>;
}

export function TagManagerModal({
  isOpen,
  collection,
  onClose,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
}: TagManagerModalProps) {
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('');
  const [renamingTagId, setRenamingTagId] = useState<string>();
  const [renamingTagName, setRenamingTagName] = useState('');
  const [renamingTagColor, setRenamingTagColor] = useState('');

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
        aria-label="Manage tags"
      >
        <h2>Tags in {collection.name}</h2>
        <p className="settings-intro">
          Tags are scoped to this collection. Names are case insensitive.
        </p>

        <ul className="tag-manager-list">
          {collection.tags.map((tag) => (
            <li key={tag.id}>
              {renamingTagId === tag.id ? (
                <>
                  <input
                    className="input"
                    maxLength={64}
                    value={renamingTagName}
                    onChange={(e) => setRenamingTagName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setRenamingTagId(undefined);
                      }
                    }}
                  />
                  <div className="color-swatches color-swatches-sm">
                    {ALL_SWATCH_COLORS.filter((color) => {
                      if (!color) return true;
                      const usedByOther = collection.tags.some(
                        (t) => t.id !== tag.id && t.color === color,
                      );
                      return !usedByOther;
                    }).map((color) => (
                      <button
                        key={color || 'none'}
                        type="button"
                        className={
                          renamingTagColor === color
                            ? 'color-swatch selected'
                            : 'color-swatch'
                        }
                        style={color ? { background: color } : undefined}
                        aria-label={color || 'No color'}
                        onClick={() => setRenamingTagColor(color)}
                      />
                    ))}
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    type="button"
                    disabled={!renamingTagName.trim()}
                    onClick={() => {
                      void onUpdateTag(
                        tag.id,
                        renamingTagName,
                        renamingTagColor || null,
                      ).then(() => setRenamingTagId(undefined));
                    }}
                  >
                    Save
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    onClick={() => setRenamingTagId(undefined)}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <div className="tag-info">
                    {tag.color && (
                      <span
                        className="tag-color-dot"
                        style={{ background: tag.color }}
                        aria-hidden="true"
                      />
                    )}
                    <span className="chip">{tag.name}</span>
                  </div>
                  <div className="tag-actions">
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      type="button"
                      title="Rename tag"
                      aria-label={`Rename ${tag.name}`}
                      onClick={() => {
                        setRenamingTagId(tag.id);
                        setRenamingTagName(tag.name);
                        setRenamingTagColor(tag.color ?? '');
                      }}
                    >
                      <PencilIcon size={13} />
                    </button>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      type="button"
                      title="Delete tag"
                      aria-label={`Delete ${tag.name}`}
                      onClick={() => void onDeleteTag(tag.id)}
                    >
                      <TrashIcon size={13} />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>

        <form
          className="tag-manager-new"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newTagName.trim()) return;
            void onCreateTag(newTagName, newTagColor || null).then(() => {
              setNewTagName('');
              setNewTagColor('');
            });
          }}
        >
          <input
            className="input"
            aria-label="New tag name"
            maxLength={64}
            placeholder="New tag name"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
          />
          <div className="color-swatches color-swatches-sm">
            {ALL_SWATCH_COLORS.filter((color) => {
              if (!color) return true;
              const used = collection.tags.some((t) => t.color === color);
              return !used;
            }).map((color) => (
              <button
                key={color || 'none'}
                type="button"
                className={
                  newTagColor === color
                    ? 'color-swatch selected'
                    : 'color-swatch'
                }
                style={color ? { background: color } : undefined}
                aria-label={color || 'No color'}
                onClick={() => setNewTagColor(color)}
              />
            ))}
          </div>
          <button
            className="btn btn-primary btn-sm"
            type="submit"
            disabled={!newTagName.trim()}
          >
            <PlusIcon size={14} />
            Add tag
          </button>
        </form>

        <div className="dialog-actions">
          <button className="btn" type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
