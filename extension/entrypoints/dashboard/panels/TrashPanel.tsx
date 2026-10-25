import type { LibraryCollection } from '../../../src/library';
import { pluralize } from '../../../src/ui/format';
import { RestoreIcon, TrashIcon } from '../../../src/ui/icons';

export function TrashPanel({
  collections,
  busy,
  onRestore,
  onDelete,
  onClearAll,
}: {
  collections: LibraryCollection[];
  busy: boolean;
  onRestore: (collectionId: string) => void;
  onDelete: (collectionId: string) => void;
  onClearAll?: () => void;
}) {
  return (
    <section className="trash">
      <header className="settings-head trash-header-row">
        <div>
          <p className="eyebrow">Recovery</p>
          <h1>Trash</h1>
          <p className="settings-intro">
            Trashed collections stay in this browser profile until you delete
            them forever.
          </p>
        </div>
        {collections.length > 0 && onClearAll && (
          <button
            className="btn btn-danger btn-sm"
            type="button"
            disabled={busy}
            onClick={onClearAll}
          >
            <TrashIcon size={14} />
            Empty trash
          </button>
        )}
      </header>
      {collections.length === 0 ? (
        <div className="empty">
          <span className="empty-mark" aria-hidden="true">
            <TrashIcon size={22} />
          </span>
          <h2>Trash is empty</h2>
          <p>Collections you remove show up here so you can bring them back.</p>
        </div>
      ) : (
        <div className="trash-list">
          {collections.map((collection) => (
            <article className="trash-item" key={collection.id}>
              <div>
                <strong>{collection.name}</strong>
                <span>
                  {collection.tabs.length} saved{' '}
                  {pluralize(collection.tabs.length, 'tab')}
                </span>
              </div>
              <div className="trash-actions">
                <button
                  className="btn btn-sm"
                  type="button"
                  disabled={busy}
                  onClick={() => onRestore(collection.id)}
                >
                  <RestoreIcon size={14} />
                  Restore
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  type="button"
                  disabled={busy}
                  onClick={() => onDelete(collection.id)}
                >
                  <TrashIcon size={14} />
                  Delete forever
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
