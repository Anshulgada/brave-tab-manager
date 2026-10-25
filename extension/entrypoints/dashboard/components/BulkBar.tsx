import { useState } from 'react';
import type { LibraryCollection } from '../../../src/library';
import { CustomSelect } from '../../../src/ui/CustomSelect';
import {
  CheckIcon,
  CloseIcon,
  FolderIcon,
  RestoreIcon,
  TagIcon,
  TrashIcon,
} from '../../../src/ui/icons';

export interface BulkBarProps {
  count: number;
  busy: boolean;
  collections: LibraryCollection[];
  tags: { id: string; name: string }[];
  tagName: string;
  onTagNameChange: (value: string) => void;
  onTag: () => void;
  onMove: (targetId: string) => void;
  onRestore: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export function BulkBar({
  count,
  busy,
  collections,
  tags,
  tagName,
  onTagNameChange,
  onTag,
  onMove,
  onRestore,
  onDelete,
  onClear,
}: BulkBarProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestions = tags.filter((tag) =>
    tag.name.toLowerCase().includes(tagName.trim().toLowerCase()),
  );

  return (
    <section className="bulk-bar" aria-label="Selected tab actions">
      <span className="bulk-count">
        <CheckIcon size={14} />
        {count} selected
      </span>
      <div className="bulk-tag-wrap">
        <form
          className="bulk-form"
          onSubmit={(event) => {
            event.preventDefault();
            onTag();
            setShowSuggestions(false);
          }}
        >
          <input
            className="input"
            aria-label="Tag the selected tabs"
            placeholder="Add a tag"
            maxLength={64}
            value={tagName}
            onChange={(event) => onTagNameChange(event.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          />
          <button
            className="btn btn-sm"
            type="submit"
            disabled={busy || !tagName.trim()}
          >
            <TagIcon size={14} />
            Tag
          </button>
        </form>
        {showSuggestions && suggestions.length > 0 && (
          <ul className="tag-suggestions">
            {suggestions.map((tag) => (
              <li key={tag.id}>
                <button
                  type="button"
                  role="option"
                  onClick={() => {
                    onTagNameChange(tag.name);
                    setShowSuggestions(false);
                  }}
                >
                  {tag.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {collections.length > 0 && (
        <CustomSelect
          value=""
          size="sm"
          direction="up"
          ariaLabel="Move the selected tabs"
          options={[
            { value: '', label: 'Move to…' },
            ...collections.map((c) => ({
              value: c.id,
              label: c.name,
              icon: <FolderIcon size={13} />,
            })),
          ]}
          onChange={(target) => {
            if (target) {
              onMove(target);
            }
          }}
        />
      )}
      <button
        className="btn btn-sm"
        type="button"
        disabled={busy}
        onClick={onRestore}
      >
        <RestoreIcon size={14} />
        Restore
      </button>
      <button
        className="btn btn-danger btn-sm"
        type="button"
        disabled={busy}
        onClick={onDelete}
      >
        <TrashIcon size={14} />
        Delete
      </button>
      <button
        className="btn btn-ghost btn-icon btn-sm"
        type="button"
        title="Clear selection"
        aria-label="Clear selection"
        onClick={onClear}
      >
        <CloseIcon size={14} />
      </button>
    </section>
  );
}
