import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { TabmanDatabase } from '../../src/database';
import {
  createCollection,
  deleteTabs,
  exportLibrary,
  importLibrary,
  type LibraryCollection,
  type LibrarySnapshot,
  loadLibrary,
  moveTabs,
  permanentlyDeleteCollections,
  renameCollection,
  restoreTabs,
  setCollectionStatus,
  tagTabs,
  updateSettings,
} from '../../src/library';
import type { LibraryChangedMessage } from '../../src/messages';
import { PRODUCT_NAME } from '../../src/product';
import type { Settings } from '../../src/schema';

type LibrarySection = 'collections' | 'trash' | 'settings';
type ImportMode = 'merge' | 'replace';

const database = new TabmanDatabase();

function collectionMatches(
  collection: LibraryCollection,
  query: string,
): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return (
    !needle ||
    collection.name.toLocaleLowerCase().includes(needle) ||
    collection.tabs.some((tab) =>
      [tab.title, tab.hostname, tab.url].some((value) =>
        value.toLocaleLowerCase().includes(needle),
      ),
    )
  );
}

export function App() {
  const importInput = useRef<HTMLInputElement>(null);
  const loadGeneration = useRef(0);
  const busyRef = useRef(false);
  const [snapshot, setSnapshot] = useState<LibrarySnapshot>();
  const [section, setSection] = useState<LibrarySection>('collections');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>();
  const [selectedTabs, setSelectedTabs] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [tagName, setTagName] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    try {
      const next = await loadLibrary(database);
      if (generation !== loadGeneration.current) {
        return;
      }
      setSnapshot(next);
      setSelectedCollectionId((current) => {
        const active = next.collections.filter(
          (collection) => collection.status === 'active',
        );
        return active.some((collection) => collection.id === current)
          ? current
          : active[0]?.id;
      });
      const liveTabIds = new Set(
        next.collections.flatMap((collection) =>
          collection.tabs.map((tab) => tab.id),
        ),
      );
      setSelectedTabs(
        (current) =>
          new Set([...current].filter((tabId) => liveTabIds.has(tabId))),
      );
      setError(undefined);
    } catch (loadError) {
      if (generation !== loadGeneration.current) {
        return;
      }
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Could not read the local library',
      );
    } finally {
      if (generation === loadGeneration.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    const messageListener = (message: LibraryChangedMessage) => {
      if (message.type === 'library/changed') {
        void load();
      }
    };
    const visibilityListener = () => {
      if (document.visibilityState === 'visible') {
        void load();
      }
    };
    browser.runtime.onMessage.addListener(messageListener);
    document.addEventListener('visibilitychange', visibilityListener);
    return () => {
      browser.runtime.onMessage.removeListener(messageListener);
      document.removeEventListener('visibilitychange', visibilityListener);
    };
  }, [load]);

  const settings = snapshot?.settings;
  useEffect(() => {
    if (!settings) {
      return;
    }
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.colorScheme =
      settings.theme === 'system' ? 'light dark' : settings.theme;
  }, [settings]);

  const activeCollections = useMemo(
    () =>
      snapshot?.collections.filter(
        (collection) =>
          collection.status === 'active' &&
          collectionMatches(collection, query),
      ) ?? [],
    [query, snapshot],
  );
  const trashedCollections =
    snapshot?.collections.filter(
      (collection) =>
        collection.status === 'trashed' && collectionMatches(collection, query),
    ) ?? [];
  const selectedCollection = snapshot?.collections.find(
    (collection) => collection.id === selectedCollectionId,
  );
  const queryNeedle = query.trim().toLocaleLowerCase();
  const queryMatchesCollection =
    selectedCollection?.name.toLocaleLowerCase().includes(queryNeedle) ?? false;
  const visibleTabs =
    selectedCollection?.tabs.filter(
      (tab) =>
        (!tagFilter || tab.tagIds.includes(tagFilter)) &&
        (!queryNeedle ||
          queryMatchesCollection ||
          [tab.title, tab.hostname, tab.url].some((value) =>
            value.toLocaleLowerCase().includes(queryNeedle),
          )),
    ) ?? [];

  useEffect(() => {
    setRenameValue(selectedCollection?.name ?? '');
  }, [selectedCollection?.name]);

  const runMutation = useCallback(
    async (
      work: () => Promise<void>,
      successMessage: string,
      clearSelection = true,
    ) => {
      if (busyRef.current) {
        return;
      }
      busyRef.current = true;
      setBusy(true);
      setError(undefined);
      setNotice(undefined);
      try {
        await work();
        setNotice(successMessage);
        if (clearSelection) {
          setSelectedTabs(new Set());
        }
        await load();
      } catch (mutationError) {
        setError(
          mutationError instanceof Error
            ? mutationError.message
            : 'The library action failed',
        );
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [load],
  );

  const toggleTab = (tabId: string) => {
    setSelectedTabs((current) => {
      const next = new Set(current);
      if (next.has(tabId)) {
        next.delete(tabId);
      } else {
        next.add(tabId);
      }
      return next;
    });
  };

  const restore = async (tabs: LibraryCollection['tabs'], label: string) => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await restoreTabs(tabs);
      const failureMessage =
        result.failures.length > 0
          ? ` ${result.failures.length} failed: ${result.failures.join(', ')}.`
          : '';
      setNotice(`${result.restored} ${label} restored.${failureMessage}`);
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : 'Could not restore saved tabs',
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const onImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    const replace = importMode === 'replace';
    if (
      replace &&
      !window.confirm(
        'Replace the entire local library with this export? This cannot be undone.',
      )
    ) {
      return;
    }
    await runMutation(
      async () => {
        const input: unknown = JSON.parse(await file.text());
        await importLibrary(database, input, replace);
      },
      replace ? 'Library replaced from export.' : 'Export merged into library.',
    );
  };

  const downloadExport = async () => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const exported = await exportLibrary(database);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(exported, null, 2)], {
          type: 'application/json',
        }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `tabman-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Library export downloaded.');
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : 'Could not export the library',
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const saveSettings = async (next: Settings) => {
    await runMutation(
      () => updateSettings(database, next),
      'Privacy and appearance settings saved.',
      false,
    );
  };

  const selectedTabRecords =
    selectedCollection?.tabs.filter((tab) => selectedTabs.has(tab.id)) ?? [];

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            T
          </span>
          <div>
            <p className="eyebrow">{PRODUCT_NAME}</p>
            <h1>Local tab library</h1>
          </div>
        </div>
        <div className="header-actions">
          <label className="import-mode">
            <span>Import mode</span>
            <select
              value={importMode}
              onChange={(event) =>
                setImportMode(event.target.value as ImportMode)
              }
            >
              <option value="merge">Merge import</option>
              <option value="replace">Replace library</option>
            </select>
          </label>
          <button
            className="secondary"
            type="button"
            disabled={busy}
            onClick={() => importInput.current?.click()}
          >
            Import
          </button>
          <input
            ref={importInput}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            aria-label="Choose a Tabman JSON export"
            tabIndex={-1}
            onChange={(event) => void onImport(event)}
          />
          <button
            className="secondary"
            type="button"
            disabled={busy}
            onClick={() => void downloadExport()}
          >
            Export
          </button>
          <button
            type="button"
            aria-pressed={section === 'settings'}
            onClick={() => setSection('settings')}
          >
            Settings
          </button>
        </div>
      </header>

      <div className="dashboard-shell">
        <aside className="library-sidebar">
          <label className="library-search">
            <span className="visually-hidden">Search saved tabs</span>
            <input
              type="search"
              placeholder="Search library…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <nav aria-label="Library sections">
            <button
              className={section === 'collections' ? 'nav-active' : ''}
              type="button"
              aria-current={section === 'collections' ? 'page' : undefined}
              onClick={() => setSection('collections')}
            >
              <span>Collections</span>
              <span>{activeCollections.length}</span>
            </button>
            <button
              className={section === 'trash' ? 'nav-active' : ''}
              type="button"
              aria-current={section === 'trash' ? 'page' : undefined}
              onClick={() => setSection('trash')}
            >
              <span>Trash</span>
              <span>{trashedCollections.length}</span>
            </button>
          </nav>

          {section === 'collections' && (
            <>
              <form
                className="create-collection"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runMutation(async () => {
                    const id = await createCollection(
                      database,
                      newCollectionName,
                    );
                    setNewCollectionName('');
                    setSelectedCollectionId(id);
                  }, 'Collection created.');
                }}
              >
                <input
                  aria-label="New collection name"
                  placeholder="New collection"
                  maxLength={120}
                  value={newCollectionName}
                  onChange={(event) => setNewCollectionName(event.target.value)}
                />
                <button
                  type="submit"
                  disabled={busy || !newCollectionName.trim()}
                >
                  Add
                </button>
              </form>
              <div className="collection-nav">
                {activeCollections.map((collection) => (
                  <button
                    className={
                      collection.id === selectedCollectionId ? 'selected' : ''
                    }
                    type="button"
                    key={collection.id}
                    onClick={() => {
                      setSelectedCollectionId(collection.id);
                      setTagFilter('');
                      setSelectedTabs(new Set());
                      setSection('collections');
                    }}
                  >
                    <span className="collection-color" aria-hidden="true" />
                    <span>
                      <strong>{collection.name}</strong>
                      <small>{collection.tabs.length} tabs</small>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="local-note">
            Stored locally in this browser profile. Nothing syncs to a cloud
            service.
          </p>
        </aside>

        <section className="library-content">
          {error && (
            <div className="banner error" role="alert">
              <span>{error}</span>
              <button
                className="text-button"
                type="button"
                onClick={() => void load()}
              >
                Retry
              </button>
            </div>
          )}
          {notice && (
            <p className="banner success" role="status">
              {notice}
            </p>
          )}

          {loading ? (
            <div className="library-empty" aria-live="polite">
              <span className="spinner" aria-hidden="true" />
              <h2>Opening your local library</h2>
            </div>
          ) : section === 'settings' && settings ? (
            <SettingsPanel
              settings={settings}
              busy={busy}
              onSave={(next) => void saveSettings(next)}
            />
          ) : section === 'trash' ? (
            <TrashPanel
              collections={trashedCollections}
              busy={busy}
              onRestore={(collectionId) =>
                void runMutation(
                  () => setCollectionStatus(database, [collectionId], 'active'),
                  'Collection restored.',
                )
              }
              onDelete={(collectionId) => {
                if (
                  window.confirm(
                    'Permanently delete this collection and all saved tabs?',
                  )
                ) {
                  void runMutation(
                    () =>
                      permanentlyDeleteCollections(database, [collectionId]),
                    'Collection permanently deleted.',
                  );
                }
              }}
            />
          ) : !selectedCollection ? (
            <Onboarding />
          ) : (
            <>
              <header className="collection-header">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void runMutation(
                      () =>
                        renameCollection(
                          database,
                          selectedCollection.id,
                          renameValue,
                        ),
                      'Collection renamed.',
                      false,
                    );
                  }}
                >
                  <input
                    aria-label="Collection name"
                    value={renameValue}
                    maxLength={120}
                    onChange={(event) => setRenameValue(event.target.value)}
                  />
                  <button
                    className="secondary"
                    type="submit"
                    disabled={
                      busy ||
                      !renameValue.trim() ||
                      renameValue.trim() === selectedCollection.name
                    }
                  >
                    Save
                  </button>
                </form>
                <div className="collection-header-actions">
                  <button
                    type="button"
                    disabled={busy || selectedCollection.tabs.length === 0}
                    onClick={() =>
                      void restore(selectedCollection.tabs, 'saved tabs')
                    }
                  >
                    Restore all
                  </button>
                  <button
                    className="danger secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm('Move this collection to Trash?')) {
                        void runMutation(
                          () =>
                            setCollectionStatus(
                              database,
                              [selectedCollection.id],
                              'trashed',
                            ),
                          'Collection moved to Trash.',
                        );
                      }
                    }}
                  >
                    Trash
                  </button>
                </div>
              </header>

              <div className="library-controls">
                <fieldset className="tag-filters">
                  <legend className="visually-hidden">Filter by tag</legend>
                  <button
                    className={!tagFilter ? 'filter-active' : ''}
                    type="button"
                    aria-pressed={!tagFilter}
                    onClick={() => setTagFilter('')}
                  >
                    All
                  </button>
                  {selectedCollection.tags.map((tag) => (
                    <button
                      className={tagFilter === tag.id ? 'filter-active' : ''}
                      type="button"
                      key={tag.id}
                      aria-pressed={tagFilter === tag.id}
                      onClick={() => setTagFilter(tag.id)}
                    >
                      {tag.name}
                    </button>
                  ))}
                </fieldset>
                <fieldset className="view-toggle">
                  <legend className="visually-hidden">Collection view</legend>
                  {(['list', 'grid'] as const).map((view) => (
                    <button
                      className={
                        settings?.defaultView === view ? 'filter-active' : ''
                      }
                      type="button"
                      key={view}
                      aria-pressed={settings?.defaultView === view}
                      onClick={() => {
                        if (settings) {
                          void saveSettings({
                            theme: settings.theme,
                            defaultView: view,
                            includeFullUrlInAi: settings.includeFullUrlInAi,
                            aiProvider: settings.aiProvider,
                          });
                        }
                      }}
                    >
                      {view === 'list' ? 'List' : 'Grid'}
                    </button>
                  ))}
                </fieldset>
              </div>

              {selectedTabs.size > 0 && (
                <div className="bulk-bar">
                  <strong>{selectedTabs.size} selected</strong>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void runMutation(
                        async () => {
                          await tagTabs(database, [...selectedTabs], tagName);
                          setTagName('');
                        },
                        'Tag applied to selected tabs.',
                        false,
                      );
                    }}
                  >
                    <input
                      aria-label="Tag selected tabs"
                      placeholder="Add tag"
                      maxLength={64}
                      value={tagName}
                      onChange={(event) => setTagName(event.target.value)}
                    />
                    <button type="submit" disabled={busy || !tagName.trim()}>
                      Tag
                    </button>
                  </form>
                  <select
                    aria-label="Move selected saved tabs"
                    defaultValue=""
                    disabled={busy}
                    onChange={(event) => {
                      const target = event.target.value;
                      if (target) {
                        void runMutation(
                          () => moveTabs(database, [...selectedTabs], target),
                          'Selected tabs moved. Matching tag names were kept in the destination collection.',
                        );
                      }
                      event.target.value = '';
                    }}
                  >
                    <option value="" disabled>
                      Move to…
                    </option>
                    {snapshot?.collections
                      .filter(
                        (collection) =>
                          collection.status === 'active' &&
                          collection.id !== selectedCollection.id,
                      )
                      .map((collection) => (
                        <option value={collection.id} key={collection.id}>
                          {collection.name}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void restore(selectedTabRecords, 'selected tabs')
                    }
                  >
                    Restore
                  </button>
                  <button
                    className="danger secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete ${selectedTabs.size} saved tab${selectedTabs.size === 1 ? '' : 's'}?`,
                        )
                      ) {
                        void runMutation(
                          () => deleteTabs(database, [...selectedTabs]),
                          'Selected saved tabs deleted.',
                        );
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}

              {visibleTabs.length === 0 ? (
                <div className="library-empty">
                  <h2>
                    {tagFilter
                      ? 'No tabs with this tag'
                      : query.trim()
                        ? 'No matching tabs'
                        : 'Collection is empty'}
                  </h2>
                  <p>
                    {query.trim() || tagFilter
                      ? 'Try a different search or clear the tag filter.'
                      : 'Park tabs from the side panel, or import a Tabman JSON export.'}
                  </p>
                </div>
              ) : (
                <div
                  className={`saved-tabs ${settings?.defaultView ?? 'list'}`}
                >
                  {visibleTabs.map((tab) => (
                    <article className="saved-tab" key={tab.id}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${tab.title || tab.hostname || tab.url}`}
                        checked={selectedTabs.has(tab.id)}
                        onChange={() => toggleTab(tab.id)}
                      />
                      {tab.favIconUrl ? (
                        <img src={tab.favIconUrl} alt="" />
                      ) : (
                        <span className="saved-fallback" aria-hidden="true">
                          {tab.hostname.slice(0, 1).toLocaleUpperCase()}
                        </span>
                      )}
                      <div className="saved-tab-copy">
                        <a href={tab.url} target="_blank" rel="noreferrer">
                          {tab.title || tab.url}
                        </a>
                        <span>{tab.hostname || tab.url}</span>
                        <div className="tab-tags">
                          {selectedCollection.tags
                            .filter((tag) => tab.tagIds.includes(tag.id))
                            .map((tag) => (
                              <span key={tag.id}>{tag.name}</span>
                            ))}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

interface SettingsPanelProps {
  settings: Settings;
  busy: boolean;
  onSave: (settings: Settings) => void;
}

function SettingsPanel({ settings, busy, onSave }: SettingsPanelProps) {
  const [draft, setDraft] = useState<Settings>({
    theme: settings.theme,
    defaultView: settings.defaultView,
    includeFullUrlInAi: settings.includeFullUrlInAi,
    aiProvider: settings.aiProvider,
  });

  useEffect(
    () =>
      setDraft({
        theme: settings.theme,
        defaultView: settings.defaultView,
        includeFullUrlInAi: settings.includeFullUrlInAi,
        aiProvider: settings.aiProvider,
      }),
    [settings],
  );

  return (
    <section className="settings-panel">
      <p className="eyebrow">Preferences</p>
      <h2>Appearance and privacy</h2>
      <p className="settings-intro">
        Tabman stays local by default. Browser storage is profile storage, not
        an operating-system keychain.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            theme: draft.theme,
            defaultView: draft.defaultView,
            includeFullUrlInAi: draft.includeFullUrlInAi,
            aiProvider: draft.aiProvider,
          });
        }}
      >
        <label>
          Theme
          <select
            value={draft.theme}
            onChange={(event) =>
              setDraft({
                ...draft,
                theme: event.target.value as Settings['theme'],
              })
            }
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label>
          Default collection view
          <select
            value={draft.defaultView}
            onChange={(event) =>
              setDraft({
                ...draft,
                defaultView: event.target.value as Settings['defaultView'],
              })
            }
          >
            <option value="list">List</option>
            <option value="grid">Grid</option>
          </select>
        </label>
        <label className="check-setting">
          <input
            type="checkbox"
            checked={draft.includeFullUrlInAi}
            onChange={(event) =>
              setDraft({
                ...draft,
                includeFullUrlInAi: event.target.checked,
              })
            }
          />
          <span>
            Include full URLs in optional AI requests
            <small>
              Off sends only titles and hostnames. No page content is scraped.
            </small>
          </span>
        </label>
        <button type="submit" disabled={busy}>
          Save settings
        </button>
      </form>
    </section>
  );
}

interface TrashPanelProps {
  collections: LibraryCollection[];
  busy: boolean;
  onRestore: (collectionId: string) => void;
  onDelete: (collectionId: string) => void;
}

function TrashPanel({
  collections,
  busy,
  onRestore,
  onDelete,
}: TrashPanelProps) {
  return (
    <section className="trash-panel">
      <p className="eyebrow">Recovery</p>
      <h2>Trash</h2>
      <p>Trashed collections remain local until permanently deleted.</p>
      {collections.length === 0 ? (
        <div className="library-empty">
          <h3>Trash is empty</h3>
        </div>
      ) : (
        <div className="trash-list">
          {collections.map((collection) => (
            <article key={collection.id}>
              <div>
                <strong>{collection.name}</strong>
                <span>{collection.tabs.length} saved tabs</span>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => onRestore(collection.id)}
              >
                Restore
              </button>
              <button
                className="danger secondary"
                type="button"
                disabled={busy}
                onClick={() => onDelete(collection.id)}
              >
                Delete forever
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Onboarding() {
  return (
    <section className="onboarding">
      <p className="eyebrow">Start local</p>
      <h2>Build a calmer browser workspace</h2>
      <p>
        Create a collection here, then use the side panel to park a selection or
        a whole window. Your tabs remain searchable in this browser profile.
      </p>
      <ol>
        <li>Create a named collection.</li>
        <li>Park open tabs from the switchboard.</li>
        <li>Restore any selection when you need it.</li>
      </ol>
    </section>
  );
}
