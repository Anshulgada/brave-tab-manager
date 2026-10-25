import type { DragEvent, RefObject } from 'react';
import type { LibraryCollection } from '../../../src/library';
import { pluralize } from '../../../src/ui/format';
import {
  EditIcon,
  HomeIcon,
  LayersIcon,
  MoreIcon,
  PlusIcon,
  RenameIcon,
  SettingsIcon,
  ShieldIcon,
  TrashIcon,
  WindowIcon,
  ZapIcon,
} from '../../../src/ui/icons';
import type { Section } from '../types';

export interface NavigationRailProps {
  section: Section;
  onNavigate: (section: Section) => void;
  trashedCount: number;
  collections: LibraryCollection[];
  selectedCollectionId?: string;
  onSelectCollection: (id: string) => void;
  creating: boolean;
  onStartCreate: () => void;
  onCancelCreate: () => void;
  newCollectionName: string;
  onNewCollectionNameChange: (val: string) => void;
  onCreateSubmit: (e: React.FormEvent) => void;
  createInputRef: RefObject<HTMLInputElement | null>;
  createFormRef: RefObject<HTMLFormElement | null>;
  menuFor?: string;
  onToggleMenu: (id: string) => void;
  onEditCollection: (collection: LibraryCollection) => void;
  onRenameCollection: (collection: LibraryCollection) => void;
  onTrashCollection: (collection: LibraryCollection) => void;
  draggingTabId?: string;
  dropTargetId?: string;
  onDragOver: (collectionId: string, e: DragEvent) => void;
  onDragLeave: (collectionId: string) => void;
  onDrop: (collection: LibraryCollection, e: DragEvent) => void;
  savedTabCount: number;
  tagCount: number;
  busy: boolean;
  hasQuery?: boolean;
}

export function NavigationRail({
  section,
  onNavigate,
  trashedCount,
  collections,
  selectedCollectionId,
  onSelectCollection,
  creating,
  onStartCreate,
  onCancelCreate,
  newCollectionName,
  onNewCollectionNameChange,
  onCreateSubmit,
  createInputRef,
  createFormRef,
  menuFor,
  onToggleMenu,
  onEditCollection,
  onRenameCollection,
  onTrashCollection,
  dropTargetId,
  onDragOver,
  onDragLeave,
  onDrop,
  savedTabCount,
  tagCount,
  busy,
  hasQuery,
}: NavigationRailProps) {
  return (
    <aside className="rail">
      <nav className="rail-nav" aria-label="Library sections">
        <button
          className={section === 'home' ? 'rail-link active' : 'rail-link'}
          type="button"
          onClick={() => onNavigate('home')}
        >
          <HomeIcon />
          <span>Home</span>
        </button>
        <button
          className={section === 'windows' ? 'rail-link active' : 'rail-link'}
          type="button"
          onClick={() => onNavigate('windows')}
        >
          <WindowIcon />
          <span>Windows</span>
        </button>
        <button
          className={section === 'organize' ? 'rail-link active' : 'rail-link'}
          type="button"
          onClick={() => onNavigate('organize')}
        >
          <LayersIcon />
          <span>Organize</span>
        </button>
        <button
          className={section === 'providers' ? 'rail-link active' : 'rail-link'}
          type="button"
          onClick={() => onNavigate('providers')}
        >
          <ZapIcon />
          <span>Providers</span>
        </button>
        <button
          className={section === 'rules' ? 'rail-link active' : 'rail-link'}
          type="button"
          onClick={() => onNavigate('rules')}
        >
          <LayersIcon />
          <span>Rules</span>
        </button>
        <button
          className={section === 'trash' ? 'rail-link active' : 'rail-link'}
          type="button"
          onClick={() => onNavigate('trash')}
        >
          <TrashIcon />
          <span>Trash</span>
          <span className="rail-count">{trashedCount}</span>
        </button>
        <button
          className={section === 'settings' ? 'rail-link active' : 'rail-link'}
          type="button"
          onClick={() => onNavigate('settings')}
        >
          <SettingsIcon />
          <span>Preferences</span>
        </button>
      </nav>

      <div className="rail-section">
        <div className="rail-heading">
          <span>Collections</span>
          <button
            className="rail-add-collection-btn"
            type="button"
            title="New collection"
            aria-label="New collection"
            onClick={onStartCreate}
          >
            <PlusIcon size={14} />
          </button>
        </div>

        {creating && (
          <form
            ref={createFormRef}
            className="rail-create"
            onSubmit={onCreateSubmit}
          >
            <input
              ref={createInputRef}
              className="input"
              aria-label="New collection name"
              placeholder="Collection name"
              maxLength={120}
              value={newCollectionName}
              onChange={(e) => onNewCollectionNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  onCancelCreate();
                }
              }}
            />
            <button
              className="btn btn-primary btn-sm"
              type="submit"
              disabled={busy || !newCollectionName.trim()}
            >
              Add
            </button>
          </form>
        )}

        <div className="rail-list">
          {collections.length === 0 ? (
            <p className="rail-empty">
              {hasQuery
                ? 'No collection matches that search.'
                : 'No collections yet. Create one to start.'}
            </p>
          ) : (
            collections.map((collection) => (
              <div
                className={[
                  'rail-item-row',
                  collection.id === selectedCollectionId ? 'selected' : '',
                  collection.id === dropTargetId ? 'drop-target' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={collection.id}
              >
                <button
                  className="rail-item"
                  type="button"
                  onClick={() => onSelectCollection(collection.id)}
                  onDragOver={(e) => onDragOver(collection.id, e)}
                  onDragLeave={() => onDragLeave(collection.id)}
                  onDrop={(e) => onDrop(collection, e)}
                >
                  <span
                    className="rail-dot"
                    style={
                      collection.color
                        ? { background: collection.color }
                        : undefined
                    }
                    aria-hidden="true"
                  />
                  <span className="rail-item-copy">
                    <strong>{collection.name}</strong>
                    <small>
                      {collection.tabs.length}{' '}
                      {pluralize(collection.tabs.length, 'tab')}
                    </small>
                  </span>
                </button>
                <button
                  className="rail-menu"
                  type="button"
                  title="Collection actions"
                  aria-label={`Actions for ${collection.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleMenu(collection.id);
                  }}
                >
                  <MoreIcon size={18} />
                </button>
                {menuFor === collection.id && (
                  <div className="rail-menu-popover" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => onEditCollection(collection)}
                    >
                      <EditIcon size={13} />
                      Edit details
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => onRenameCollection(collection)}
                    >
                      <RenameIcon size={13} />
                      Rename
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="danger"
                      onClick={() => onTrashCollection(collection)}
                    >
                      <TrashIcon size={13} />
                      Move to trash
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rail-footer">
        <div className="rail-stats">
          <span>
            <strong>{savedTabCount}</strong> saved tabs
          </span>
          <span>
            <strong>{tagCount}</strong> {pluralize(tagCount, 'tag')}
          </span>
        </div>
        <p className="rail-note">
          <ShieldIcon size={14} />
          <span>
            Stored in this browser profile. Nothing leaves the device.
          </span>
        </p>
      </div>
    </aside>
  );
}
