import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
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
import { sendSwitchboardRequest } from '../../src/runtime';
import type { Settings } from '../../src/schema';
import {
  hostInitial,
  hostLabel,
  pluralize,
  relativeTime,
  tabLabel,
} from '../../src/ui/format';
import {
  ArrowUpRightIcon,
  CheckIcon,
  ChevronIcon,
  CloseIcon,
  DownloadIcon,
  FolderIcon,
  GridIcon,
  LayersIcon,
  LibraryIcon,
  ListIcon,
  MoonIcon,
  MoreIcon,
  PlusIcon,
  RestoreIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  SparkIcon,
  SunIcon,
  TagIcon,
  TrashIcon,
  UploadIcon,
  ZapIcon,
} from '../../src/ui/icons';
import { shortcut } from '../../src/ui/platform';
import { OrganizePanel, ProvidersPanel } from './panels';

const database = new TabmanDatabase();
const VIEW_STORAGE_KEY = 'tabman.library-view';

type Section = 'library' | 'organize' | 'providers' | 'trash' | 'settings';
type View = 'grid' | 'list';
type SortOrder = 'recent' | 'name' | 'tabs';

type Toast = {
  id: number;
  tone: 'info' | 'success' | 'danger';
  message: string;
};

type ConfirmRequest = {
  title: string;
  body: string;
  confirmLabel: string;
  tone: 'danger' | 'brand';
  onConfirm: () => void;
};

type Command = {
  id: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
};

function readStoredView(fallback: View): View {
  try {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return stored === 'grid' || stored === 'list' ? stored : fallback;
  } catch {
    return fallback;
  }
}

export function App() {
  const importInput = useRef<HTMLInputElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const loadGeneration = useRef(0);
  const busyRef = useRef(false);
  const toastId = useRef(0);
  const [snapshot, setSnapshot] = useState<LibrarySnapshot>();
  const [section, setSection] = useState<Section>('library');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>();
  const [selectedTabs, setSelectedTabs] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent');
  const [view, setView] = useState<View>('grid');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [creating, setCreating] = useState(false);
  const [tagName, setTagName] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest>();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collectOpen, setCollectOpen] = useState(false);
  const [collectName, setCollectName] = useState('');
  const [draggingTabId, setDraggingTabId] = useState<string>();
  const [dropTargetId, setDropTargetId] = useState<string>();
  const [paletteQuery, setPaletteQuery] = useState('');

  const pushToast = useCallback(
    (message: string, tone: Toast['tone'] = 'info') => {
      const id = ++toastId.current;
      setToasts((current) => [...current, { id, message, tone }]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, 4200);
    },
    [],
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

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
    } catch (loadError) {
      if (generation !== loadGeneration.current) {
        return;
      }
      pushToast(
        loadError instanceof Error
          ? loadError.message
          : 'Could not read the local library',
        'danger',
      );
    } finally {
      if (generation === loadGeneration.current) {
        setLoading(false);
      }
    }
  }, [pushToast]);

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
  const [currentTheme, setCurrentTheme] = useState<string>('system');

  const applyTheme = useCallback((theme: string) => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme =
      theme === 'system' ? 'light dark' : theme;
    setCurrentTheme(theme);
  }, []);

  useEffect(() => {
    if (settings) {
      applyTheme(settings.theme);
    }
  }, [applyTheme, settings]);

  const toggleTheme = async () => {
    if (!settings) {
      return;
    }
    const next = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    await saveSettings({ ...settings, theme: next });
  };

  const defaultView = settings?.defaultView;
  useEffect(() => {
    if (defaultView) {
      setView(readStoredView(defaultView));
    }
  }, [defaultView]);

  const activeCollections = useMemo(
    () =>
      (snapshot?.collections ?? []).filter(
        (collection) => collection.status === 'active',
      ),
    [snapshot],
  );
  const trashedCollections = useMemo(
    () =>
      (snapshot?.collections ?? []).filter(
        (collection) => collection.status === 'trashed',
      ),
    [snapshot],
  );
  const selectedCollection = activeCollections.find(
    (collection) => collection.id === selectedCollectionId,
  );

  const filteredCollections = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) {
      return activeCollections;
    }
    return activeCollections.filter(
      (collection) =>
        collection.name.toLocaleLowerCase().includes(needle) ||
        collection.tabs.some((tab) =>
          [tab.title, tab.hostname, tab.url].some((value) =>
            value.toLocaleLowerCase().includes(needle),
          ),
        ),
    );
  }, [activeCollections, query]);

  const visibleTabs = useMemo(() => {
    const tabs = selectedCollection?.tabs ?? [];
    const needle = query.trim().toLocaleLowerCase();
    const filtered = tabs.filter(
      (tab) =>
        (!tagFilter || tab.tagIds.includes(tagFilter)) &&
        (!needle ||
          [tab.title, tab.hostname, tab.url].some((value) =>
            value.toLocaleLowerCase().includes(needle),
          )),
    );
    return [...filtered].sort((left, right) => {
      if (sortOrder === 'name') {
        return tabLabel(left.title, left.hostname, left.url).localeCompare(
          tabLabel(right.title, right.hostname, right.url),
        );
      }
      if (sortOrder === 'tabs') {
        return right.position - left.position;
      }
      return (
        Date.parse(right.lastAccessedAt ?? right.createdAt) -
        Date.parse(left.lastAccessedAt ?? left.createdAt)
      );
    });
  }, [query, selectedCollection, sortOrder, tagFilter]);

  const savedTabCount = useMemo(
    () =>
      activeCollections.reduce(
        (total, collection) => total + collection.tabs.length,
        0,
      ),
    [activeCollections],
  );
  const tagCount = useMemo(() => {
    const names = new Set<string>();
    for (const collection of activeCollections) {
      for (const tag of collection.tags) {
        names.add(tag.name.toLocaleLowerCase());
      }
    }
    return names.size;
  }, [activeCollections]);

  useEffect(() => {
    setRenameValue(selectedCollection?.name ?? '');
    setRenaming(false);
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
      try {
        await work();
        pushToast(successMessage, 'success');
        if (clearSelection) {
          setSelectedTabs(new Set());
        }
        await load();
      } catch (mutationError) {
        pushToast(
          mutationError instanceof Error
            ? mutationError.message
            : 'The library action failed',
          'danger',
        );
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [load, pushToast],
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

  const restore = useCallback(
    async (tabs: LibraryCollection['tabs'], label: string) => {
      if (busyRef.current) {
        return;
      }
      busyRef.current = true;
      setBusy(true);
      try {
        const result = await restoreTabs(tabs);
        const failureMessage =
          result.failures.length > 0
            ? ` ${result.failures.length} failed: ${result.failures.join(', ')}.`
            : '';
        pushToast(
          `${result.restored} ${label} restored.${failureMessage}`,
          result.failures.length > 0 ? 'danger' : 'success',
        );
      } catch (restoreError) {
        pushToast(
          restoreError instanceof Error
            ? restoreError.message
            : 'Could not restore saved tabs',
          'danger',
        );
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [pushToast],
  );

  const onImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    const replace = window.confirm(
      'Replace the entire local library with this export? This cannot be undone.',
    );
    if (replace) {
      await runMutation(async () => {
        const input: unknown = JSON.parse(await file.text());
        await importLibrary(database, input, true);
      }, 'Library replaced from export.');
      return;
    }
    await runMutation(async () => {
      const input: unknown = JSON.parse(await file.text());
      await importLibrary(database, input, false);
    }, 'Export merged into the library.');
  };

  const downloadExport = useCallback(async () => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
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
      pushToast('Library export downloaded.', 'success');
    } catch (exportError) {
      pushToast(
        exportError instanceof Error
          ? exportError.message
          : 'Could not export the library',
        'danger',
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [pushToast]);

  const saveSettings = useCallback(
    async (next: Settings) => {
      await runMutation(
        () => updateSettings(database, next),
        'Preferences saved.',
        false,
      );
    },
    [runMutation],
  );

  const applyView = useCallback((next: View) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // A blocked storage API is not worth interrupting the user for.
    }
  }, []);

  const openCollectDialog = () => {
    setCollectName(`Collected ${new Date().toLocaleDateString()}`);
    setCollectOpen(true);
  };

  const collectAll = async () => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setCollectOpen(false);
    try {
      const response = await sendSwitchboardRequest({
        type: 'library/collect',
        name: collectName.trim() || undefined,
      });
      if (!response.ok) {
        throw new Error(response.error);
      }
      if (!('affected' in response)) {
        throw new Error('The collect action did not report a result');
      }
      pushToast(
        `${response.affected} open tabs collected into ${
          response.collectionName ?? 'a new collection'
        }.`,
        'success',
      );
      if (response.collectionId) {
        setSelectedCollectionId(response.collectionId);
      }
      await load();
    } catch (collectError) {
      pushToast(
        collectError instanceof Error
          ? collectError.message
          : 'The open tabs could not be collected',
        'danger',
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const requestConfirm = (request: ConfirmRequest) => {
    setConfirmRequest(request);
  };

  useEffect(() => {
    if (creating) {
      createInputRef.current?.focus();
    }
  }, [creating]);

  useEffect(() => {
    if (renaming) {
      renameInputRef.current?.focus();
    }
  }, [renaming]);

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      {
        id: 'new-collection',
        label: 'New collection',
        hint: 'Create an empty collection',
        icon: <PlusIcon />,
        run: () => {
          setSection('library');
          setCreating(true);
        },
      },
      {
        id: 'import',
        label: 'Import an export',
        hint: 'Merge a Tabman JSON export',
        icon: <UploadIcon />,
        run: () => importInput.current?.click(),
      },
      {
        id: 'export',
        label: 'Export the library',
        hint: 'Download a JSON backup',
        icon: <DownloadIcon />,
        run: () => void downloadExport(),
      },
      {
        id: 'view',
        label: `Switch to ${view === 'grid' ? 'list' : 'grid'} view`,
        icon: view === 'grid' ? <ListIcon /> : <GridIcon />,
        run: () => applyView(view === 'grid' ? 'list' : 'grid'),
      },
      {
        id: 'trash',
        label: 'Open trash',
        icon: <TrashIcon />,
        run: () => setSection('trash'),
      },
      {
        id: 'settings',
        label: 'Open preferences',
        icon: <SettingsIcon />,
        run: () => setSection('settings'),
      },
    ];
    if (selectedCollection) {
      list.unshift({
        id: 'restore-all',
        label: `Restore every tab in ${selectedCollection.name}`,
        icon: <RestoreIcon />,
        run: () => void restore(selectedCollection.tabs, 'saved tabs'),
      });
    }
    for (const collection of activeCollections) {
      list.push({
        id: `open-${collection.id}`,
        label: collection.name,
        hint: `${collection.tabs.length} ${pluralize(collection.tabs.length, 'tab')}`,
        icon: <FolderIcon />,
        run: () => {
          setSection('library');
          setSelectedCollectionId(collection.id);
          setTagFilter('');
          setSelectedTabs(new Set());
        },
      });
    }
    return list;
  }, [
    activeCollections,
    applyView,
    downloadExport,
    restore,
    selectedCollection,
    view,
  ]);

  const filteredCommands = useMemo(() => {
    const needle = paletteQuery.trim().toLocaleLowerCase();
    if (!needle) {
      return commands;
    }
    return commands.filter((command) =>
      command.label.toLocaleLowerCase().includes(needle),
    );
  }, [commands, paletteQuery]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLocaleLowerCase() === 'k'
      ) {
        event.preventDefault();
        setPaletteOpen((current) => !current);
        setPaletteQuery('');
      }
      if (event.key === 'Escape') {
        setPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const selectedTabRecords =
    selectedCollection?.tabs.filter((tab) => selectedTabs.has(tab.id)) ?? [];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            T
          </span>
          <div className="brand-copy">
            <strong>{PRODUCT_NAME}</strong>
            <span>Local library</span>
          </div>
        </div>

        <button
          className="palette-trigger"
          type="button"
          onClick={() => {
            setPaletteOpen(true);
            setPaletteQuery('');
          }}
        >
          <SearchIcon size={15} />
          <span>Search collections and commands</span>
          <span className="kbd">{shortcut('K')}</span>
        </button>

        <div className="topbar-actions">
          <button
            className="btn btn-ghost btn-icon"
            type="button"
            title="Import an export"
            aria-label="Import an export"
            onClick={() => importInput.current?.click()}
          >
            <UploadIcon />
          </button>
          <button
            className="btn btn-ghost btn-icon"
            type="button"
            title="Export the library"
            aria-label="Export the library"
            onClick={() => void downloadExport()}
          >
            <DownloadIcon />
          </button>
          <button
            className="btn btn-ghost btn-icon"
            type="button"
            title={
              currentTheme === 'dark'
                ? 'Switch to the light theme'
                : 'Switch to the dark theme'
            }
            aria-label={
              currentTheme === 'dark'
                ? 'Switch to the light theme'
                : 'Switch to the dark theme'
            }
            onClick={() => void toggleTheme()}
          >
            {currentTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            className="btn btn-ghost btn-icon"
            type="button"
            title="Preferences"
            aria-label="Preferences"
            onClick={() => setSection('settings')}
          >
            <SettingsIcon />
          </button>
        </div>
        <input
          ref={importInput}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          aria-label="Choose a Tabman JSON export"
          tabIndex={-1}
          onChange={(event) => void onImport(event)}
        />
      </header>

      <div className="workspace">
        <aside className="rail">
          <nav className="rail-nav" aria-label="Library sections">
            <button
              className={
                section === 'library' ? 'rail-link active' : 'rail-link'
              }
              type="button"
              onClick={() => setSection('library')}
            >
              <LayersIcon />
              <span>Library</span>
              <span className="rail-count">{activeCollections.length}</span>
            </button>
            <button
              className={
                section === 'organize' ? 'rail-link active' : 'rail-link'
              }
              type="button"
              onClick={() => setSection('organize')}
            >
              <SparkIcon />
              <span>Organize</span>
            </button>
            <button
              className={
                section === 'providers' ? 'rail-link active' : 'rail-link'
              }
              type="button"
              onClick={() => setSection('providers')}
            >
              <ZapIcon />
              <span>Providers</span>
            </button>
            <button
              className={section === 'trash' ? 'rail-link active' : 'rail-link'}
              type="button"
              onClick={() => setSection('trash')}
            >
              <TrashIcon />
              <span>Trash</span>
              <span className="rail-count">{trashedCollections.length}</span>
            </button>
            <button
              className={
                section === 'settings' ? 'rail-link active' : 'rail-link'
              }
              type="button"
              onClick={() => setSection('settings')}
            >
              <SettingsIcon />
              <span>Preferences</span>
            </button>
          </nav>

          <div className="rail-section">
            <div className="rail-heading">
              <span>Collections</span>
              <button
                className="btn btn-ghost btn-icon btn-sm"
                type="button"
                title="New collection"
                aria-label="New collection"
                onClick={() => setCreating(true)}
              >
                <PlusIcon size={14} />
              </button>
            </div>

            {creating && (
              <form
                className="rail-create"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runMutation(async () => {
                    const id = await createCollection(
                      database,
                      newCollectionName,
                    );
                    setNewCollectionName('');
                    setCreating(false);
                    setSelectedCollectionId(id);
                  }, 'Collection created.');
                }}
              >
                <input
                  ref={createInputRef}
                  className="input"
                  aria-label="New collection name"
                  placeholder="Collection name"
                  maxLength={120}
                  value={newCollectionName}
                  onChange={(event) => setNewCollectionName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setCreating(false);
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
              {filteredCollections.length === 0 ? (
                <p className="rail-empty">
                  {query
                    ? 'No collection matches that search.'
                    : 'No collections yet. Create one to start.'}
                </p>
              ) : (
                filteredCollections.map((collection) => (
                  <button
                    className={[
                      'rail-item',
                      collection.id === selectedCollectionId ? 'selected' : '',
                      collection.id === dropTargetId ? 'drop-target' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    type="button"
                    key={collection.id}
                    onClick={() => {
                      setSelectedCollectionId(collection.id);
                      setTagFilter('');
                      setSelectedTabs(new Set());
                      setSection('library');
                    }}
                    onDragOver={(event) => {
                      if (!draggingTabId) {
                        return;
                      }
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      setDropTargetId(collection.id);
                    }}
                    onDragLeave={() =>
                      setDropTargetId((current) =>
                        current === collection.id ? undefined : current,
                      )
                    }
                    onDrop={(event) => {
                      event.preventDefault();
                      setDropTargetId(undefined);
                      const tabId = draggingTabId;
                      setDraggingTabId(undefined);
                      if (!tabId) {
                        return;
                      }
                      void runMutation(
                        () => moveTabs(database, [tabId], collection.id),
                        `Moved to ${collection.name}.`,
                      );
                    }}
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

        <main className="content">
          {loading ? (
            <LoadingState />
          ) : section === 'settings' && settings ? (
            <SettingsPanel
              settings={settings}
              busy={busy}
              onApplyTheme={applyTheme}
              onSave={(next) => void saveSettings(next)}
            />
          ) : section === 'providers' ? (
            <ProvidersPanel onNotify={pushToast} />
          ) : section === 'organize' ? (
            <OrganizePanel onNotify={pushToast} onApplied={() => void load()} />
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
              onDelete={(collectionId) =>
                requestConfirm({
                  title: 'Delete permanently?',
                  body: 'The collection and every saved tab inside it are erased from this browser profile. This cannot be undone.',
                  confirmLabel: 'Delete forever',
                  tone: 'danger',
                  onConfirm: () =>
                    void runMutation(
                      () =>
                        permanentlyDeleteCollections(database, [collectionId]),
                      'Collection permanently deleted.',
                    ),
                })
              }
            />
          ) : !selectedCollection ? (
            <WelcomeState
              onCreate={() => setCreating(true)}
              onCollect={openCollectDialog}
            />
          ) : (
            <>
              <CollectBar busy={busy} onCollect={openCollectDialog} />

              <section className="collection-head">
                <div className="collection-title">
                  {renaming ? (
                    <form
                      className="collection-rename"
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
                        ).then(() => setRenaming(false));
                      }}
                    >
                      <input
                        ref={renameInputRef}
                        className="input collection-rename-input"
                        aria-label="Collection name"
                        value={renameValue}
                        maxLength={120}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            setRenaming(false);
                            setRenameValue(selectedCollection.name);
                          }
                        }}
                      />
                      <button className="btn btn-primary btn-sm" type="submit">
                        Save
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        type="button"
                        onClick={() => {
                          setRenaming(false);
                          setRenameValue(selectedCollection.name);
                        }}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <button
                      className="collection-name"
                      type="button"
                      title="Rename collection"
                      onClick={() => setRenaming(true)}
                    >
                      <h1>{selectedCollection.name}</h1>
                      <MoreIcon size={16} />
                    </button>
                  )}
                  <div className="collection-meta">
                    <span className="chip">
                      <LibraryIcon size={13} />
                      {selectedCollection.tabs.length}{' '}
                      {pluralize(selectedCollection.tabs.length, 'saved tab')}
                    </span>
                    <span className="chip">
                      <TagIcon size={13} />
                      {selectedCollection.tags.length}{' '}
                      {pluralize(selectedCollection.tags.length, 'tag')}
                    </span>
                    <span className="chip chip-subtle">
                      Updated {relativeTime(selectedCollection.updatedAt)}
                    </span>
                  </div>
                </div>

                <div className="collection-actions">
                  <button
                    className="btn"
                    type="button"
                    disabled={busy || selectedCollection.tabs.length === 0}
                    onClick={() =>
                      void restore(selectedCollection.tabs, 'saved tabs')
                    }
                  >
                    <RestoreIcon size={15} />
                    Restore all
                  </button>
                  <button
                    className="btn btn-danger"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      requestConfirm({
                        title: 'Move to trash?',
                        body: 'The collection stays recoverable in Trash until you delete it forever.',
                        confirmLabel: 'Move to trash',
                        tone: 'brand',
                        onConfirm: () =>
                          void runMutation(
                            () =>
                              setCollectionStatus(
                                database,
                                [selectedCollection.id],
                                'trashed',
                              ),
                            'Collection moved to trash.',
                          ),
                      })
                    }
                  >
                    <TrashIcon size={15} />
                    Trash
                  </button>
                </div>
              </section>

              <section className="toolbar">
                <fieldset className="tag-pills">
                  <legend className="visually-hidden">Filter by tag</legend>
                  <button
                    className="chip chip-button"
                    type="button"
                    aria-pressed={!tagFilter}
                    onClick={() => setTagFilter('')}
                  >
                    All
                  </button>
                  {selectedCollection.tags.map((tag) => (
                    <button
                      className="chip chip-button"
                      type="button"
                      key={tag.id}
                      aria-pressed={tagFilter === tag.id}
                      onClick={() =>
                        setTagFilter(tagFilter === tag.id ? '' : tag.id)
                      }
                    >
                      {tag.name}
                    </button>
                  ))}
                </fieldset>

                <div className="toolbar-right">
                  <span className="toolbar-count">
                    {visibleTabs.length} of {selectedCollection.tabs.length}
                  </span>
                  <select
                    className="select select-compact"
                    aria-label="Sort saved tabs"
                    value={sortOrder}
                    onChange={(event) =>
                      setSortOrder(event.target.value as SortOrder)
                    }
                  >
                    <option value="recent">Most recent</option>
                    <option value="name">Title</option>
                    <option value="tabs">Position</option>
                  </select>
                  <div className="segmented">
                    <button
                      type="button"
                      aria-pressed={view === 'grid'}
                      aria-label="Grid view"
                      onClick={() => applyView('grid')}
                    >
                      <GridIcon size={14} />
                    </button>
                    <button
                      type="button"
                      aria-pressed={view === 'list'}
                      aria-label="List view"
                      onClick={() => applyView('list')}
                    >
                      <ListIcon size={14} />
                    </button>
                  </div>
                </div>
              </section>

              {visibleTabs.length === 0 ? (
                <EmptyCollection
                  filtered={Boolean(query.trim() || tagFilter)}
                  onClear={() => {
                    setQuery('');
                    setTagFilter('');
                  }}
                />
              ) : view === 'grid' ? (
                <div className="card-grid">
                  {visibleTabs.map((tab) => (
                    <TabCard
                      key={tab.id}
                      tab={tab}
                      tags={selectedCollection.tags.filter((tag) =>
                        tab.tagIds.includes(tag.id),
                      )}
                      selected={selectedTabs.has(tab.id)}
                      onToggle={() => toggleTab(tab.id)}
                      onRestore={() =>
                        void restore(
                          selectedCollection.tabs.filter(
                            (candidate) => candidate.id === tab.id,
                          ),
                          'tab',
                        )
                      }
                      onDelete={() =>
                        requestConfirm({
                          title: 'Delete saved tab?',
                          body: 'The tab is removed from this collection. The page itself is not touched.',
                          confirmLabel: 'Delete tab',
                          tone: 'danger',
                          onConfirm: () =>
                            void runMutation(
                              () => deleteTabs(database, [tab.id]),
                              'Saved tab deleted.',
                            ),
                        })
                      }
                      onDragStart={() => setDraggingTabId(tab.id)}
                      onDragEnd={() => setDraggingTabId(undefined)}
                    />
                  ))}
                </div>
              ) : (
                <div className="card-list">
                  {visibleTabs.map((tab) => (
                    <TabRow
                      key={tab.id}
                      tab={tab}
                      tags={selectedCollection.tags.filter((tag) =>
                        tab.tagIds.includes(tag.id),
                      )}
                      selected={selectedTabs.has(tab.id)}
                      onToggle={() => toggleTab(tab.id)}
                      onRestore={() =>
                        void restore(
                          selectedCollection.tabs.filter(
                            (candidate) => candidate.id === tab.id,
                          ),
                          'tab',
                        )
                      }
                      onDelete={() =>
                        requestConfirm({
                          title: 'Delete saved tab?',
                          body: 'The tab is removed from this collection. The page itself is not touched.',
                          confirmLabel: 'Delete tab',
                          tone: 'danger',
                          onConfirm: () =>
                            void runMutation(
                              () => deleteTabs(database, [tab.id]),
                              'Saved tab deleted.',
                            ),
                        })
                      }
                      onDragStart={() => setDraggingTabId(tab.id)}
                      onDragEnd={() => setDraggingTabId(undefined)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {selectedTabs.size > 0 && selectedCollection && (
        <BulkBar
          count={selectedTabs.size}
          busy={busy}
          collections={activeCollections.filter(
            (collection) => collection.id !== selectedCollection.id,
          )}
          tagName={tagName}
          onTagNameChange={setTagName}
          onTag={() =>
            void runMutation(
              async () => {
                await tagTabs(database, [...selectedTabs], tagName);
                setTagName('');
              },
              'Tag applied to the selected tabs.',
              false,
            )
          }
          onMove={(targetId) =>
            void runMutation(
              () => moveTabs(database, [...selectedTabs], targetId),
              'Selected tabs moved.',
            )
          }
          onRestore={() => void restore(selectedTabRecords, 'selected tabs')}
          onDelete={() =>
            requestConfirm({
              title: `Delete ${selectedTabs.size} ${pluralize(selectedTabs.size, 'tab')}?`,
              body: 'The saved copies are removed from the library. The open browser tabs are not touched.',
              confirmLabel: 'Delete tabs',
              tone: 'danger',
              onConfirm: () =>
                void runMutation(
                  () => deleteTabs(database, [...selectedTabs]),
                  'Selected tabs deleted.',
                ),
            })
          }
          onClear={() => setSelectedTabs(new Set())}
        />
      )}

      {paletteOpen && (
        <CommandPalette
          commands={filteredCommands}
          query={paletteQuery}
          onQueryChange={setPaletteQuery}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      {collectOpen && (
        <div className="overlay">
          <button
            className="overlay-backdrop"
            type="button"
            aria-label="Cancel"
            onClick={() => setCollectOpen(false)}
          />
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Collect the open tabs"
          >
            <h2>Collect every open tab</h2>
            <p>
              Tabman saves the tabs you have open right now into a new
              collection. They stay open in the browser.
            </p>
            <label className="dialog-field">
              Collection name
              <input
                className="input"
                maxLength={120}
                value={collectName}
                onChange={(event) => setCollectName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void collectAll();
                  }
                }}
              />
            </label>
            <div className="dialog-actions">
              <button
                className="btn"
                type="button"
                onClick={() => setCollectOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy}
                onClick={() => void collectAll()}
              >
                <ZapIcon size={15} />
                Collect
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmRequest && (
        <ConfirmDialog
          request={confirmRequest}
          onCancel={() => setConfirmRequest(undefined)}
          onConfirm={() => {
            confirmRequest.onConfirm();
            setConfirmRequest(undefined);
          }}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="content-skeleton" aria-live="polite" aria-busy="true">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-sub" />
      <div className="skeleton-grid">
        {['a', 'b', 'c', 'd', 'e', 'f'].map((slot) => (
          <div className="skeleton skeleton-card" key={slot} />
        ))}
      </div>
    </div>
  );
}

function WelcomeState({
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

function CollectBar({
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

function EmptyCollection({
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

interface TabCardProps {
  tab: LibraryCollection['tabs'][number];
  tags: { id: string; name: string }[];
  selected: boolean;
  onToggle: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

function TabCard({
  tab,
  tags,
  selected,
  onToggle,
  onRestore,
  onDelete,
  onDragStart,
  onDragEnd,
}: TabCardProps) {
  const title = tabLabel(tab.title, tab.hostname, tab.url);
  const host = hostLabel(tab.hostname, tab.url);
  return (
    <article
      className={selected ? 'tab-card selected' : 'tab-card'}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', tab.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="tab-card-top">
        <input
          className="checkbox"
          type="checkbox"
          aria-label={`Select ${title}`}
          checked={selected}
          onChange={onToggle}
        />
        {tab.favIconUrl ? (
          <img
            className="tab-favicon"
            src={tab.favIconUrl}
            alt=""
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        ) : (
          <span className="tab-favicon fallback" aria-hidden="true">
            {hostInitial(tab.hostname, tab.url)}
          </span>
        )}
        <a
          className="tab-title"
          href={tab.url}
          target="_blank"
          rel="noreferrer"
          title={tab.url}
        >
          {title}
        </a>
        <div className="tab-card-actions">
          <button
            className="btn btn-ghost btn-icon btn-sm"
            type="button"
            title="Restore this tab"
            aria-label="Restore this tab"
            onClick={onRestore}
          >
            <ArrowUpRightIcon size={15} />
          </button>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            type="button"
            title="Delete this tab"
            aria-label="Delete this tab"
            onClick={onDelete}
          >
            <CloseIcon size={15} />
          </button>
        </div>
      </div>
      <span className="tab-host">{host}</span>
      {tags.length > 0 && (
        <div className="tab-tags">
          {tags.map((tag) => (
            <span className="chip" key={tag.id}>
              {tag.name}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function TabRow({
  tab,
  tags,
  selected,
  onToggle,
  onRestore,
  onDelete,
  onDragStart,
  onDragEnd,
}: TabCardProps) {
  const title = tabLabel(tab.title, tab.hostname, tab.url);
  const host = hostLabel(tab.hostname, tab.url);
  return (
    <article
      className={selected ? 'tab-row selected' : 'tab-row'}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', tab.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <input
        className="checkbox"
        type="checkbox"
        aria-label={`Select ${title}`}
        checked={selected}
        onChange={onToggle}
      />
      {tab.favIconUrl ? (
        <img
          className="tab-favicon"
          src={tab.favIconUrl}
          alt=""
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      ) : (
        <span className="tab-favicon fallback" aria-hidden="true">
          {hostInitial(tab.hostname, tab.url)}
        </span>
      )}
      <a
        className="tab-row-main"
        href={tab.url}
        target="_blank"
        rel="noreferrer"
        title={tab.url}
      >
        <strong>{title}</strong>
        <span>{host}</span>
      </a>
      <div className="tab-row-tags">
        {tags.map((tag) => (
          <span className="chip" key={tag.id}>
            {tag.name}
          </span>
        ))}
      </div>
      <div className="tab-row-actions">
        <button
          className="btn btn-ghost btn-icon btn-sm"
          type="button"
          title="Restore this tab"
          aria-label="Restore this tab"
          onClick={onRestore}
        >
          <ArrowUpRightIcon size={15} />
        </button>
        <button
          className="btn btn-ghost btn-icon btn-sm"
          type="button"
          title="Delete this tab"
          aria-label="Delete this tab"
          onClick={onDelete}
        >
          <CloseIcon size={15} />
        </button>
      </div>
    </article>
  );
}

interface BulkBarProps {
  count: number;
  busy: boolean;
  collections: LibraryCollection[];
  tagName: string;
  onTagNameChange: (value: string) => void;
  onTag: () => void;
  onMove: (targetId: string) => void;
  onRestore: () => void;
  onDelete: () => void;
  onClear: () => void;
}

function BulkBar({
  count,
  busy,
  collections,
  tagName,
  onTagNameChange,
  onTag,
  onMove,
  onRestore,
  onDelete,
  onClear,
}: BulkBarProps) {
  return (
    <section className="bulk-bar" aria-label="Selected tab actions">
      <span className="bulk-count">
        <CheckIcon size={14} />
        {count} selected
      </span>
      <form
        className="bulk-form"
        onSubmit={(event) => {
          event.preventDefault();
          onTag();
        }}
      >
        <input
          className="input"
          aria-label="Tag the selected tabs"
          placeholder="Add a tag"
          maxLength={64}
          value={tagName}
          onChange={(event) => onTagNameChange(event.target.value)}
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
      {collections.length > 0 && (
        <select
          className="select select-compact"
          aria-label="Move the selected tabs"
          defaultValue=""
          onChange={(event) => {
            const target = event.target.value;
            if (target) {
              onMove(target);
            }
            event.target.value = '';
          }}
        >
          <option value="" disabled>
            Move to…
          </option>
          {collections.map((collection) => (
            <option value={collection.id} key={collection.id}>
              {collection.name}
            </option>
          ))}
        </select>
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

function SettingsPanel({
  settings,
  busy,
  onApplyTheme,
  onSave,
}: {
  settings: Settings;
  busy: boolean;
  onApplyTheme: (theme: string) => void;
  onSave: (settings: Settings) => void;
}) {
  const [draft, setDraft] = useState<Settings>(settings);

  useEffect(() => setDraft(settings), [settings]);

  return (
    <section className="settings">
      <header className="settings-head">
        <p className="eyebrow">Preferences</p>
        <h1>Appearance and privacy</h1>
        <p className="settings-intro">
          Tabman keeps everything in this browser profile. Nothing is uploaded,
          and no page content is ever scraped.
        </p>
      </header>

      <div className="settings-grid">
        <form
          className="settings-card"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(draft);
          }}
        >
          <div className="settings-card-head">
            <span className="settings-icon">
              <SunIcon size={16} />
            </span>
            <div>
              <h2>Theme</h2>
              <p>Match the browser or pick a side.</p>
            </div>
          </div>
          <div className="segmented segmented-wide">
            {(['system', 'light', 'dark'] as const).map((theme) => (
              <button
                type="button"
                key={theme}
                aria-pressed={draft.theme === theme}
                onClick={() => {
                  setDraft({ ...draft, theme });
                  onApplyTheme(theme);
                }}
              >
                {theme === 'system'
                  ? 'System'
                  : theme === 'light'
                    ? 'Light'
                    : 'Dark'}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            Save theme
          </button>
        </form>

        <form
          className="settings-card"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(draft);
          }}
        >
          <div className="settings-card-head">
            <span className="settings-icon">
              <GridIcon size={16} />
            </span>
            <div>
              <h2>Default view</h2>
              <p>How saved collections open.</p>
            </div>
          </div>
          <div className="segmented segmented-wide">
            {(['grid', 'list'] as const).map((defaultView) => (
              <button
                type="button"
                key={defaultView}
                aria-pressed={draft.defaultView === defaultView}
                onClick={() => setDraft({ ...draft, defaultView })}
              >
                {defaultView === 'grid' ? 'Grid' : 'List'}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            Save view
          </button>
        </form>

        <form
          className="settings-card"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(draft);
          }}
        >
          <div className="settings-card-head">
            <span className="settings-icon">
              <ShieldIcon size={16} />
            </span>
            <div>
              <h2>Privacy</h2>
              <p>Control what an optional AI request may contain.</p>
            </div>
          </div>
          <label className="settings-toggle">
            <span>Include full URLs in AI requests</span>
            <input
              className="switch"
              type="checkbox"
              role="switch"
              aria-checked={draft.includeFullUrlInAi}
              checked={draft.includeFullUrlInAi}
              onChange={(event) =>
                setDraft({ ...draft, includeFullUrlInAi: event.target.checked })
              }
            />
          </label>
          <p className="settings-note">
            Off sends only titles and hostnames. Tabman never reads the page
            body.
          </p>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            Save privacy
          </button>
        </form>

        <div className="settings-card">
          <div className="settings-card-head">
            <span className="settings-icon">
              <ZapIcon size={16} />
            </span>
            <div>
              <h2>Shortcuts</h2>
              <p>Work faster from the keyboard.</p>
            </div>
          </div>
          <ul className="shortcut-list">
            <li>
              <span className="kbd">{shortcut('K')}</span>Open the command
              palette
            </li>
            <li>
              <span className="kbd">/</span>Focus the search field
            </li>
            <li>
              <span className="kbd">Esc</span>Close an overlay or clear a
              selection
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function TrashPanel({
  collections,
  busy,
  onRestore,
  onDelete,
}: {
  collections: LibraryCollection[];
  busy: boolean;
  onRestore: (collectionId: string) => void;
  onDelete: (collectionId: string) => void;
}) {
  return (
    <section className="trash">
      <header className="settings-head">
        <p className="eyebrow">Recovery</p>
        <h1>Trash</h1>
        <p className="settings-intro">
          Trashed collections stay in this browser profile until you delete them
          forever.
        </p>
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

function CommandPalette({
  commands,
  query,
  onQueryChange,
  onClose,
}: {
  commands: Command[];
  query: string;
  onQueryChange: (value: string) => void;
  onClose: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [lastQuery, setLastQuery] = useState(query);
  const paletteInputRef = useRef<HTMLInputElement>(null);

  if (lastQuery !== query) {
    setLastQuery(query);
    setActiveIndex(0);
  }

  useEffect(() => {
    paletteInputRef.current?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) =>
        commands.length === 0 ? 0 : (current + 1) % commands.length,
      );
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) =>
        commands.length === 0
          ? 0
          : (current - 1 + commands.length) % commands.length,
      );
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const command = commands[activeIndex];
      if (command) {
        onClose();
        command.run();
      }
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div className="overlay">
      <button
        className="overlay-backdrop"
        type="button"
        aria-label="Close the command palette"
        onClick={onClose}
      />
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="palette-input">
          <SearchIcon size={16} />
          <input
            ref={paletteInputRef}
            aria-label="Search commands"
            placeholder="Search commands and collections…"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <span className="kbd">Esc</span>
        </div>
        <ul className="palette-list">
          {commands.length === 0 ? (
            <li className="palette-empty">Nothing matches that search.</li>
          ) : (
            commands.map((command, index) => (
              <li key={command.id}>
                <button
                  className={
                    index === activeIndex
                      ? 'palette-item active'
                      : 'palette-item'
                  }
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    onClose();
                    command.run();
                  }}
                >
                  <span className="palette-icon">{command.icon}</span>
                  <span className="palette-label">{command.label}</span>
                  {command.hint && (
                    <span className="palette-hint">{command.hint}</span>
                  )}
                  <ChevronIcon size={14} />
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

function ConfirmDialog({
  request,
  onCancel,
  onConfirm,
}: {
  request: ConfirmRequest;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="overlay">
      <button
        className="overlay-backdrop"
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
      />
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={request.title}
      >
        <h2>{request.title}</h2>
        <p>{request.body}</p>
        <div className="dialog-actions">
          <button className="btn" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={
              request.tone === 'danger' ? 'btn btn-danger' : 'btn btn-primary'
            }
            type="button"
            onClick={onConfirm}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) {
    return null;
  }
  return (
    <section className="toast-stack" aria-label="Notifications">
      {toasts.map((toast) => (
        <div
          className={`toast toast-${toast.tone}`}
          key={toast.id}
          role="status"
        >
          <span className="toast-mark" aria-hidden="true">
            {toast.tone === 'danger' ? (
              <CloseIcon size={13} />
            ) : (
              <CheckIcon size={13} />
            )}
          </span>
          <span>{toast.message}</span>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            type="button"
            aria-label="Dismiss"
            onClick={() => onDismiss(toast.id)}
          >
            <CloseIcon size={13} />
          </button>
        </div>
      ))}
    </section>
  );
}
