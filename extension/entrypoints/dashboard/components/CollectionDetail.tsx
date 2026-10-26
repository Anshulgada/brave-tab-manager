import { AnimatePresence, motion } from 'framer-motion';
import type { FormEvent, RefObject } from 'react';
import type { TabRecord } from '../../../src/database';
import type { LibraryCollection } from '../../../src/library';
import { CustomSelect } from '../../../src/ui/CustomSelect';
import { pluralize, relativeTime } from '../../../src/ui/format';
import {
  CloseIcon,
  GridIcon,
  LayersIcon,
  LibraryIcon,
  ListIcon,
  PencilIcon,
  RestoreIcon,
  SearchIcon,
  TagIcon,
  TrashIcon,
  ZapIcon,
} from '../../../src/ui/icons';
import type { SortOrder, View } from '../types';
import { TabCard, TabRow } from './TabCard';

export interface CollectionDetailProps {
  collection: LibraryCollection;
  busy: boolean;
  onCollect: () => void;
  renaming: boolean;
  renameValue: string;
  onRenameValueChange: (val: string) => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onSubmitRename: (e: FormEvent) => void;
  renameInputRef: RefObject<HTMLInputElement | null>;
  onRestoreCollection: () => void;
  onTrashCollection: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  selectedTabs: Set<string>;
  visibleTabs: TabRecord[];
  onToggleSelectAll: () => void;
  sortOrder: SortOrder;
  onSortOrderChange: (order: SortOrder) => void;
  view: View;
  onViewChange: (v: View) => void;
  onOpenTagManager: () => void;
  tagFilter: string;
  onTagFilterChange: (tagId: string) => void;
  onToggleTab: (tabId: string) => void;
  onRestoreTab: (tab: TabRecord) => void;
  onDeleteTab: (tab: TabRecord) => void;
  onEditTab: (tab: TabRecord) => void;
  onPinTab: (tab: TabRecord) => void;
  onDragStartTab: (tabId: string) => void;
  onDragEndTab: () => void;
}

export function CollectBar({
  busy,
  onCollect,
}: {
  busy: boolean;
  onCollect: () => void;
}) {
  return (
    <section className="collect-bar">
      <div>
        <strong>Collect every open tab</strong>
        <span>
          Save the tabs you have open right now into a new collection. They stay
          open in the browser.
        </span>
      </div>
      <button
        className="btn btn-primary"
        type="button"
        disabled={busy}
        onClick={onCollect}
      >
        <ZapIcon size={15} />
        Collect all open tabs
      </button>
    </section>
  );
}

export function EmptyCollection({
  filtered,
  onClear,
}: {
  filtered: boolean;
  onClear: () => void;
}) {
  return (
    <section className="empty">
      <span className="empty-mark" aria-hidden="true">
        {filtered ? <SearchIcon size={22} /> : <LayersIcon size={22} />}
      </span>
      <h2>
        {filtered ? 'Nothing matches that filter' : 'This collection is empty'}
      </h2>
      <p>
        {filtered
          ? 'Try another search, or clear the tag filter to see every saved tab.'
          : 'Park tabs from the side panel, or import a Tabman JSON export to fill it in one go.'}
      </p>
      {filtered && (
        <button className="btn" type="button" onClick={onClear}>
          Clear filters
        </button>
      )}
    </section>
  );
}

export function CollectionDetail({
  collection,
  busy,
  onCollect,
  renaming,
  renameValue,
  onRenameValueChange,
  onStartRename,
  onCancelRename,
  onSubmitRename,
  renameInputRef,
  onRestoreCollection,
  onTrashCollection,
  query,
  onQueryChange,
  selectedTabs,
  visibleTabs,
  onToggleSelectAll,
  sortOrder,
  onSortOrderChange,
  view,
  onViewChange,
  onOpenTagManager,
  tagFilter,
  onTagFilterChange,
  onToggleTab,
  onRestoreTab,
  onDeleteTab,
  onEditTab,
  onPinTab,
  onDragStartTab,
  onDragEndTab,
}: CollectionDetailProps) {
  return (
    <>
      <CollectBar busy={busy} onCollect={onCollect} />

      <section className="collection-head">
        <div className="collection-title">
          {renaming ? (
            <form className="collection-rename" onSubmit={onSubmitRename}>
              <input
                ref={renameInputRef}
                className="input collection-rename-input"
                aria-label="Collection name"
                value={renameValue}
                maxLength={120}
                onChange={(e) => onRenameValueChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    onCancelRename();
                  }
                }}
              />
              <button className="btn btn-primary btn-sm" type="submit">
                Save
              </button>
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={onCancelRename}
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              className="collection-name"
              type="button"
              title="Rename collection"
              onClick={onStartRename}
            >
              <h1>{collection.name}</h1>
              <PencilIcon size={15} />
            </button>
          )}
          <div className="collection-meta">
            <span className="chip">
              <LibraryIcon size={13} />
              {collection.tabs.length}{' '}
              {pluralize(collection.tabs.length, 'saved tab')}
            </span>
            <span className="chip">
              <TagIcon size={13} />
              {collection.tags.length}{' '}
              {pluralize(collection.tags.length, 'tag')}
            </span>
            <span className="chip chip-subtle">
              Updated {relativeTime(collection.updatedAt)}
            </span>
          </div>
        </div>

        <div className="collection-actions">
          <button
            className="btn"
            type="button"
            disabled={busy || collection.tabs.length === 0}
            onClick={onRestoreCollection}
          >
            <RestoreIcon size={15} />
            Restore in new window
          </button>
          <button
            className="btn btn-danger"
            type="button"
            disabled={busy}
            onClick={onTrashCollection}
          >
            <TrashIcon size={15} />
            Trash
          </button>
        </div>
      </section>

      <section className="collection-toolbar-redesigned">
        <div className="collection-toolbar-main">
          <div className="collection-toolbar-left">
            <div className="collection-search-wrap">
              <SearchIcon size={14} />
              <input
                type="search"
                className="collection-search-input"
                placeholder={`Search ${collection.tabs.length} tabs...`}
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                aria-label="Search tabs in this collection"
              />
              {query && (
                <button
                  type="button"
                  className="btn btn-ghost btn-icon btn-sm"
                  onClick={() => onQueryChange('')}
                  aria-label="Clear search"
                >
                  <CloseIcon size={12} />
                </button>
              )}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onToggleSelectAll}
              title={
                selectedTabs.size === visibleTabs.length &&
                visibleTabs.length > 0
                  ? 'Deselect all'
                  : 'Select all visible tabs'
              }
            >
              {selectedTabs.size === visibleTabs.length &&
              visibleTabs.length > 0
                ? 'Deselect all'
                : 'Select all'}
            </button>
          </div>

          <div className="collection-toolbar-right">
            <span className="collection-tab-count-pill">
              {visibleTabs.length} of {collection.tabs.length} tabs
            </span>
            <CustomSelect<SortOrder>
              value={sortOrder}
              options={[
                { value: 'recent', label: 'Most recent' },
                { value: 'name', label: 'Title (A–Z)' },
                { value: 'domain', label: 'Domain (A–Z)' },
                { value: 'tabs', label: 'Park order' },
              ]}
              onChange={onSortOrderChange}
              ariaLabel="Sort saved tabs"
            />
            <div className="segmented-pill-track">
              <button
                type="button"
                className={`segmented-pill-btn ${
                  view === 'grid' ? 'active' : ''
                }`}
                aria-pressed={view === 'grid'}
                aria-label="Grid view"
                onClick={() => onViewChange('grid')}
              >
                {view === 'grid' && (
                  <motion.div
                    layoutId="viewPill"
                    className="segmented-pill-slider"
                    transition={{
                      type: 'spring',
                      stiffness: 500,
                      damping: 35,
                    }}
                  />
                )}
                <span className="segmented-pill-text">
                  <GridIcon size={14} />
                </span>
              </button>
              <button
                type="button"
                className={`segmented-pill-btn ${
                  view === 'list' ? 'active' : ''
                }`}
                aria-pressed={view === 'list'}
                aria-label="List view"
                onClick={() => onViewChange('list')}
              >
                {view === 'list' && (
                  <motion.div
                    layoutId="viewPill"
                    className="segmented-pill-slider"
                    transition={{
                      type: 'spring',
                      stiffness: 500,
                      damping: 35,
                    }}
                  />
                )}
                <span className="segmented-pill-text">
                  <ListIcon size={14} />
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="collection-tags-bar">
          <button
            className="chip chip-button"
            type="button"
            title="Manage the collection tags"
            onClick={onOpenTagManager}
          >
            <TagIcon size={13} />
            Manage tags
          </button>
          <button
            className="chip chip-button"
            type="button"
            aria-pressed={!tagFilter}
            onClick={() => onTagFilterChange('')}
          >
            All
          </button>
          {collection.tags.map((tag) => (
            <button
              className="chip chip-button"
              type="button"
              key={tag.id}
              aria-pressed={tagFilter === tag.id}
              onClick={() =>
                onTagFilterChange(tagFilter === tag.id ? '' : tag.id)
              }
            >
              {tag.color && (
                <span
                  className="tag-color-dot"
                  style={{ background: tag.color }}
                  aria-hidden="true"
                />
              )}
              {tag.name}
            </button>
          ))}
        </div>
      </section>

      {visibleTabs.length === 0 ? (
        <EmptyCollection
          filtered={Boolean(query.trim() || tagFilter)}
          onClear={() => {
            onQueryChange('');
            onTagFilterChange('');
          }}
        />
      ) : (
        <AnimatePresence mode="wait">
          {view === 'grid' ? (
            <motion.div
              key="grid"
              className="card-grid"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {visibleTabs.map((tab) => (
                <TabCard
                  key={tab.id}
                  tab={tab}
                  tags={collection.tags.filter((tag) =>
                    tab.tagIds.includes(tag.id),
                  )}
                  selected={selectedTabs.has(tab.id)}
                  onToggle={() => onToggleTab(tab.id)}
                  onRestore={() => onRestoreTab(tab)}
                  onDelete={() => onDeleteTab(tab)}
                  onEdit={() => onEditTab(tab)}
                  onPin={() => onPinTab(tab)}
                  onDragStart={() => onDragStartTab(tab.id)}
                  onDragEnd={onDragEndTab}
                />
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="list"
              className="card-list"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {visibleTabs.map((tab) => (
                <TabRow
                  key={tab.id}
                  tab={tab}
                  tags={collection.tags.filter((tag) =>
                    tab.tagIds.includes(tag.id),
                  )}
                  selected={selectedTabs.has(tab.id)}
                  onToggle={() => onToggleTab(tab.id)}
                  onRestore={() => onRestoreTab(tab)}
                  onDelete={() => onDeleteTab(tab)}
                  onEdit={() => onEditTab(tab)}
                  onPin={() => onPinTab(tab)}
                  onDragStart={() => onDragStartTab(tab.id)}
                  onDragEnd={onDragEndTab}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </>
  );
}
