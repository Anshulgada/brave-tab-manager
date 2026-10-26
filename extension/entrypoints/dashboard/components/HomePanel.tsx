import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import type { LibraryCollection } from '../../../src/library';
import {
  CheckIcon,
  CloseIcon,
  FolderIcon,
  PlusIcon,
  SparkIcon,
  TagIcon,
  TrashIcon,
  WindowIcon,
  ZapIcon,
} from '../../../src/ui/icons';

export interface HomePanelProps {
  collections: LibraryCollection[];
  savedTabCount: number;
  tagCount: number;
  onCollect: () => void;
  onCreate: () => void;
  onSelectCollection: (id: string) => void;
  onDeleteCollections: (ids: string[]) => void;
}

export function WelcomeState({
  onCreate,
  onCollect,
}: {
  onCreate: () => void;
  onCollect: () => void;
}) {
  return (
    <section className="welcome">
      <span className="welcome-mark" aria-hidden="true">
        <SparkIcon size={26} />
      </span>
      <h2>Your tab library starts here</h2>
      <p>
        Collect the tabs you have open right now, park tabs from the side panel,
        or create a collection and fill it by hand. Everything stays in this
        browser profile.
      </p>
      <div className="welcome-actions">
        <button className="btn btn-primary" type="button" onClick={onCollect}>
          <ZapIcon size={15} />
          Collect every open tab
        </button>
        <button className="btn" type="button" onClick={onCreate}>
          <PlusIcon size={15} />
          New collection
        </button>
      </div>
      <ol className="welcome-steps">
        <li>
          <span>1</span>Collect or park the open tabs
        </li>
        <li>
          <span>2</span>Group them into collections
        </li>
        <li>
          <span>3</span>Restore them whenever you need them
        </li>
      </ol>
    </section>
  );
}

export function HomePanel({
  collections,
  savedTabCount,
  tagCount,
  onCollect,
  onCreate,
  onSelectCollection,
  onDeleteCollections,
}: HomePanelProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelectedIds((curr) => {
      const next = new Set(curr);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === collections.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(collections.map((c) => c.id)));
    }
  };

  return (
    <section className="home">
      <header className="home-header">
        <h1>Tabman</h1>
        <p className="home-subtitle">
          Your tab library — organized, searchable, local.
        </p>
      </header>

      <section className="home-stats" aria-label="Library statistics">
        <motion.article
          className="stat-card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <span className="stat-icon">
            <FolderIcon size={20} />
          </span>
          <div>
            <strong>{collections.length}</strong>
            <span>Collections</span>
          </div>
        </motion.article>
        <motion.article
          className="stat-card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.05 }}
        >
          <span className="stat-icon">
            <WindowIcon size={20} />
          </span>
          <div>
            <strong>{savedTabCount}</strong>
            <span>Saved tabs</span>
          </div>
        </motion.article>
        <motion.article
          className="stat-card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.1 }}
        >
          <span className="stat-icon">
            <TagIcon size={20} />
          </span>
          <div>
            <strong>{tagCount}</strong>
            <span>Tags</span>
          </div>
        </motion.article>
      </section>

      <section className="home-actions" aria-label="Quick actions">
        <button className="btn btn-primary" type="button" onClick={onCollect}>
          <ZapIcon size={16} />
          Collect every open tab
        </button>
        <button className="btn" type="button" onClick={onCreate}>
          <PlusIcon size={16} />
          New collection
        </button>
      </section>

      {collections.length > 0 && (
        <section className="home-collections" aria-label="Your collections">
          <header className="home-section-header">
            <h2>Collections</h2>
            <div className="home-section-actions">
              {selectedIds.size > 0 ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear selection
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={selectAll}
                >
                  Select all
                </button>
              )}
            </div>
          </header>

          <AnimatePresence>
            {selectedIds.size > 0 && (
              <motion.div
                className="floating-bulk-island"
                role="toolbar"
                aria-label="Bulk collection actions"
                initial={{ opacity: 0, y: 24, x: '-50%' }}
                animate={{ opacity: 1, y: 0, x: '-50%' }}
                exit={{ opacity: 0, y: 24, x: '-50%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              >
                <div
                  className="home-bulk-info"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <span className="bulk-count">
                    <CheckIcon size={14} />
                    {selectedIds.size} of {collections.length} selected
                  </span>
                </div>
                <div
                  className="home-bulk-actions"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={selectAll}
                  >
                    {selectedIds.size === collections.length
                      ? 'Deselect all'
                      : 'Select all'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      onDeleteCollections(Array.from(selectedIds));
                      setSelectedIds(new Set());
                    }}
                  >
                    <TrashIcon size={14} />
                    Move to trash
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm"
                    title="Cancel selection"
                    aria-label="Cancel selection"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    <CloseIcon size={14} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="collections-grid">
            {collections.map((collection, index) => {
              const isSelected = selectedIds.has(collection.id);
              return (
                <motion.div
                  key={collection.id}
                  className={`collection-card ${isSelected ? 'selected' : ''}`}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    duration: 0.15,
                    delay: Math.min(index * 0.02, 0.3),
                  }}
                >
                  <span
                    className="collection-card-checkbox"
                    title={
                      isSelected ? 'Deselect collection' : 'Select collection'
                    }
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSelect(collection.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${collection.name}`}
                    />
                  </span>
                  <button
                    type="button"
                    className="collection-card-body"
                    onClick={() => {
                      if (selectedIds.size > 0) {
                        toggleSelect(collection.id);
                      } else {
                        onSelectCollection(collection.id);
                      }
                    }}
                  >
                    <div className="collection-card-header">
                      <span
                        className="collection-color"
                        style={{
                          background: collection.color || 'var(--brand)',
                        }}
                        aria-hidden="true"
                      />
                      <h3>{collection.name}</h3>
                    </div>
                    <div className="collection-card-meta">
                      <span>
                        {collection.tabs.length} tab
                        {collection.tabs.length !== 1 ? 's' : ''}
                      </span>
                      <span>
                        {collection.tags.length} tag
                        {collection.tags.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {collection.description && (
                      <p className="collection-card-desc">
                        {collection.description}
                      </p>
                    )}
                  </button>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {collections.length === 0 && (
        <WelcomeState onCreate={onCreate} onCollect={onCollect} />
      )}
    </section>
  );
}
