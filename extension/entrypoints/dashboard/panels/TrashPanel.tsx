import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '../../../src/components/ui/button';
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
          <Button
            variant="destructive"
            size="sm"
            type="button"
            disabled={busy}
            onClick={onClearAll}
          >
            <TrashIcon size={14} />
            Empty trash
          </Button>
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
          <AnimatePresence>
            {collections.map((collection) => (
              <motion.article
                className="trash-item"
                key={collection.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                whileHover={{ y: -2 }}
                transition={{ duration: 0.18 }}
              >
                <div>
                  <strong>{collection.name}</strong>
                  <span>
                    {collection.tabs.length} saved{' '}
                    {pluralize(collection.tabs.length, 'tab')}
                  </span>
                </div>
                <div className="trash-actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    disabled={busy}
                    onClick={() => onRestore(collection.id)}
                  >
                    <RestoreIcon size={14} />
                    Restore
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    type="button"
                    disabled={busy}
                    onClick={() => onDelete(collection.id)}
                  >
                    <TrashIcon size={14} />
                    Delete forever
                  </Button>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}
