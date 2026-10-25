import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { DEFAULT_PREBUILT_RULES_JSONL } from '../../src/ai';
import { TabmanDatabase, type TabRecord } from '../../src/database';
import {
  createCollection,
  createTag,
  deleteTabs,
  deleteTag,
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
  updateCollection,
  updateSettings,
  updateTab,
  updateTag,
} from '../../src/library';
import type { LibraryChangedMessage } from '../../src/messages';
import { sendSwitchboardRequest } from '../../src/runtime';
import type { Settings } from '../../src/schema';
import { pluralize, tabLabel } from '../../src/ui/format';
import {
  DownloadIcon,
  GridIcon,
  ListIcon,
  PlusIcon,
  RestoreIcon,
  SettingsIcon,
  TrashIcon,
  UploadIcon,
} from '../../src/ui/icons';
import {
  BulkBar,
  CollectionDetail,
  CollectModal,
  CommandPalette,
  ConfirmDialog,
  EditCollectionModal,
  EditTabModal,
  HelpDialog,
  HomePanel,
  LoadingState,
  NavigationRail,
  TagManagerModal,
  ToastStack,
  Topbar,
} from './components';
import {
  OrganizePanel,
  ProvidersPanel,
  RulesPanel,
  SettingsPanel,
  TrashPanel,
  WindowsPanel,
} from './panels';
import { useHashRoute } from './router';
import {
  type Command,
  type ConfirmRequest,
  type Section,
  type SortOrder,
  type Toast,
  VIEW_STORAGE_KEY,
  type View,
} from './types';

const database = new TabmanDatabase();

function readStoredView(fallback: View): View {
  try {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return stored === 'grid' || stored === 'list' ? stored : fallback;
  } catch {
    return fallback;
  }
}

function rootDomainSortKey(hostname: string): string {
  if (!hostname) return '';
  const clean = hostname.toLowerCase().trim();
  const withoutPort = clean.split(':')[0] || '';
  const stripped = withoutPort.replace(/^(www\d*|m)\./, '');
  const parts = stripped.split('.');
  if (parts.length > 1) {
    return parts[0] || stripped;
  }
  return stripped;
}

export function App() {
  const importInput = useRef<HTMLInputElement>(null);
  const createFormRef = useRef<HTMLFormElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const loadGeneration = useRef(0);
  const busyRef = useRef(false);
  const toastId = useRef(0);

  const [route, setRoute] = useHashRoute();
  const [snapshot, setSnapshot] = useState<LibrarySnapshot>();
  const [rules, setRules] = useState(DEFAULT_PREBUILT_RULES_JSONL);

  const [menuFor, setMenuFor] = useState<string>();
  const [helpOpen, setHelpOpen] = useState(false);
  const [collectDialogOpen, setCollectDialogOpen] = useState(false);
  const [collectName, setCollectName] = useState('');

  const [tagManagerOpen, setTagManagerOpen] = useState(false);

  const [collectionEditorOpen, setCollectionEditorOpen] = useState(false);
  const [editCollectionName, setEditCollectionName] = useState('');
  const [editCollectionDescription, setEditCollectionDescription] =
    useState('');
  const [editCollectionColor, setEditCollectionColor] = useState('');

  const [editingTab, setEditingTab] = useState<TabRecord>();
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');

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
  const [paletteQuery, setPaletteQuery] = useState('');
  const [draggingTabId, setDraggingTabId] = useState<string>();
  const [dropTargetId, setDropTargetId] = useState<string>();

  const navigateTo = useCallback(
    (next: Section, collectionId?: string) => {
      setSelectedTabs(new Set());
      setQuery('');
      setMenuFor(undefined);
      setRoute({ section: next, collectionId });
    },
    [setRoute],
  );

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
    try {
      const stored = localStorage.getItem('tabman-local-rules');
      setRules(stored?.trim() ? stored : DEFAULT_PREBUILT_RULES_JSONL);
    } catch {
      // ignore
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
    if (typeof browser !== 'undefined' && browser.runtime?.onMessage) {
      browser.runtime.onMessage.addListener(messageListener);
    }
    document.addEventListener('visibilitychange', visibilityListener);
    return () => {
      if (typeof browser !== 'undefined' && browser.runtime?.onMessage) {
        browser.runtime.onMessage.removeListener(messageListener);
      }
      document.removeEventListener('visibilitychange', visibilityListener);
    };
  }, [load]);

  useEffect(() => {
    if (!menuFor) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.rail-menu-popover, .rail-menu')) return;
      setMenuFor(undefined);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuFor]);

  const settings = snapshot?.settings;
  const [currentTheme, setCurrentTheme] = useState<string>('system');

  const applyTheme = useCallback((theme: string) => {
    const updateTheme = () => {
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme =
        theme === 'system' ? 'light dark' : theme;
      setCurrentTheme(theme);
    };

    if (
      typeof document !== 'undefined' &&
      'startViewTransition' in document &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      document.startViewTransition(() => {
        updateTheme();
      });
    } else {
      updateTheme();
    }
  }, []);

  useEffect(() => {
    if (settings?.theme) {
      applyTheme(settings.theme);
    }
  }, [applyTheme, settings?.theme]);

  const toggleTheme = async () => {
    const baseSettings = settings ?? {
      theme: 'system',
      defaultView: 'grid',
      includeFullUrlInAi: false,
      aiProvider: null,
    };
    const next = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setSnapshot((current) =>
      current
        ? { ...current, settings: { ...current.settings, theme: next } }
        : current,
    );
    await saveSettings({ ...baseSettings, theme: next });
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

  const selectedCollection = useMemo(() => {
    if (route.collectionId) {
      const match = activeCollections.find((c) => c.id === route.collectionId);
      if (match) return match;
    }
    return undefined;
  }, [activeCollections, route.collectionId]);

  const filteredCollections = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return activeCollections;
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
      if (left.pinned !== right.pinned) {
        return left.pinned ? -1 : 1;
      }
      if (sortOrder === 'name') {
        return tabLabel(left.title, left.hostname, left.url).localeCompare(
          tabLabel(right.title, right.hostname, right.url),
        );
      }
      if (sortOrder === 'domain') {
        const leftDomain = rootDomainSortKey(left.hostname);
        const rightDomain = rootDomainSortKey(right.hostname);
        const cmp = leftDomain.localeCompare(rightDomain);
        if (cmp !== 0) return cmp;
        return tabLabel(left.title, left.hostname, left.url).localeCompare(
          tabLabel(right.title, right.hostname, right.url),
        );
      }
      if (sortOrder === 'tabs') {
        return left.position - right.position;
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
      if (busyRef.current) return;
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
    async (
      tabs: LibraryCollection['tabs'],
      label: string,
      inNewWindow = false,
    ) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        const result = await restoreTabs(tabs, inNewWindow);
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
    if (!file) return;
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
    if (busyRef.current) return;
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
      // ignore
    }
  }, []);

  const collectAll = async () => {
    if (busyRef.current) return;
    if (route.section === 'collection' && selectedCollection) {
      await performCollect(selectedCollection.name, selectedCollection.id);
      return;
    }
    setCollectName(`Collected ${new Date().toLocaleDateString()}`);
    setCollectDialogOpen(true);
  };

  const performCollect = async (name: string, collectionId?: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setCollectDialogOpen(false);
    try {
      const response = await sendSwitchboardRequest({
        type: 'library/collect',
        name,
        collectionId,
      });
      if (!response.ok) throw new Error(response.error);
      if (!('affected' in response)) {
        throw new Error('The collect action did not report a result');
      }
      const count = response.affected;
      const collName = response.collectionName ?? 'the collection';
      if (count === 0) {
        pushToast(`All open tabs are already in ${collName}.`, 'info');
      } else {
        pushToast(
          `${count} open ${pluralize(count, 'tab')} collected into ${collName}.`,
          'success',
        );
      }
      await load();
      if (response.collectionId) {
        navigateTo('collection', response.collectionId);
      }
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
    if (!creating) return;
    createInputRef.current?.focus();

    const handleClickOutside = (e: MouseEvent) => {
      if (
        createFormRef.current &&
        !createFormRef.current.contains(e.target as Node)
      ) {
        setCreating(false);
        setNewCollectionName('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
          navigateTo('home');
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
        run: () => navigateTo('trash'),
      },
      {
        id: 'settings',
        label: 'Open preferences',
        icon: <SettingsIcon />,
        run: () => navigateTo('settings'),
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
    return list;
  }, [
    applyView,
    downloadExport,
    navigateTo,
    restore,
    selectedCollection,
    view,
  ]);

  const filteredCommands = useMemo(() => {
    const needle = paletteQuery.trim().toLocaleLowerCase();
    if (!needle) return commands;
    return commands.filter((cmd) =>
      [cmd.label, cmd.hint ?? ''].some((value) =>
        value.toLocaleLowerCase().includes(needle),
      ),
    );
  }, [commands, paletteQuery]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((current) => !current);
        setPaletteQuery('');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const selectedTabRecords =
    selectedCollection?.tabs.filter((tab) => selectedTabs.has(tab.id)) ?? [];

  // Determine effective section
  const currentSection = route.section;

  return (
    <div className="app">
      <Topbar
        currentTheme={currentTheme}
        importInputRef={importInput}
        onOpenPalette={() => {
          setPaletteOpen(true);
          setPaletteQuery('');
        }}
        onImportFile={(e) => void onImport(e)}
        onExport={() => void downloadExport()}
        onToggleTheme={() => void toggleTheme()}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenSettings={() => navigateTo('settings')}
      />

      <div className="workspace">
        <NavigationRail
          section={currentSection}
          onNavigate={(sec) => navigateTo(sec)}
          trashedCount={trashedCollections.length}
          collections={filteredCollections}
          selectedCollectionId={selectedCollection?.id}
          onSelectCollection={(id) => {
            setTagFilter('');
            setSelectedTabs(new Set());
            navigateTo('collection', id);
          }}
          creating={creating}
          onStartCreate={() => setCreating(true)}
          onCancelCreate={() => {
            setCreating(false);
            setNewCollectionName('');
          }}
          newCollectionName={newCollectionName}
          onNewCollectionNameChange={setNewCollectionName}
          onCreateSubmit={(e) => {
            e.preventDefault();
            void runMutation(async () => {
              const id = await createCollection(database, newCollectionName);
              setNewCollectionName('');
              setCreating(false);
              navigateTo('collection', id);
            }, 'Collection created.');
          }}
          createInputRef={createInputRef}
          createFormRef={createFormRef}
          menuFor={menuFor}
          onToggleMenu={(id) =>
            setMenuFor((current) => (current === id ? undefined : id))
          }
          onEditCollection={(coll) => {
            setMenuFor(undefined);
            navigateTo('collection', coll.id);
            setCollectionEditorOpen(true);
            setEditCollectionName(coll.name);
            setEditCollectionDescription(coll.description ?? '');
            setEditCollectionColor(coll.color ?? '');
          }}
          onRenameCollection={(coll) => {
            setMenuFor(undefined);
            navigateTo('collection', coll.id);
            setRenaming(true);
          }}
          onTrashCollection={(coll) => {
            setMenuFor(undefined);
            if (window.confirm(`Move "${coll.name}" to the trash?`)) {
              void runMutation(
                () => setCollectionStatus(database, [coll.id], 'trashed'),
                'Collection moved to trash.',
              );
            }
          }}
          dropTargetId={dropTargetId}
          onDragOver={(id, e) => {
            if (!draggingTabId) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDropTargetId(id);
          }}
          onDragLeave={(id) => {
            setDropTargetId((current) =>
              current === id ? undefined : current,
            );
          }}
          onDrop={(coll, e) => {
            e.preventDefault();
            setDropTargetId(undefined);
            const tabId = draggingTabId;
            setDraggingTabId(undefined);
            if (!tabId) return;
            void runMutation(
              () => moveTabs(database, [tabId], coll.id),
              `Moved to ${coll.name}.`,
            );
          }}
          savedTabCount={savedTabCount}
          tagCount={tagCount}
          busy={busy}
          hasQuery={Boolean(query.trim())}
        />

        <main className="content">
          {loading ? (
            <LoadingState />
          ) : currentSection === 'home' || currentSection === 'library' ? (
            <HomePanel
              collections={activeCollections}
              savedTabCount={savedTabCount}
              tagCount={tagCount}
              onCollect={() => void collectAll()}
              onCreate={() => setCreating(true)}
              onSelectCollection={(id) => {
                setTagFilter('');
                setSelectedTabs(new Set());
                navigateTo('collection', id);
              }}
              onDeleteCollections={(ids) => {
                if (
                  window.confirm(
                    `Move ${ids.length} ${pluralize(ids.length, 'collection')} to the trash?`,
                  )
                ) {
                  void runMutation(
                    () => setCollectionStatus(database, ids, 'trashed'),
                    `${pluralize(ids.length, 'collection')} moved to trash.`,
                  );
                }
              }}
            />
          ) : currentSection === 'windows' ? (
            <WindowsPanel onNotify={pushToast} />
          ) : currentSection === 'settings' ? (
            <SettingsPanel
              settings={
                settings ??
                ({
                  theme: 'system',
                  defaultView: 'grid',
                  includeFullUrlInAi: false,
                } as Settings)
              }
              busy={busy}
              onApplyTheme={applyTheme}
              onSave={(next) => void saveSettings(next)}
            />
          ) : currentSection === 'providers' ? (
            <ProvidersPanel onNotify={pushToast} />
          ) : currentSection === 'organize' ? (
            <OrganizePanel
              rules={rules}
              onNotify={pushToast}
              onApplied={() => {
                void load();
                navigateTo('home');
              }}
            />
          ) : currentSection === 'rules' ? (
            <RulesPanel rules={rules} onChange={setRules} />
          ) : currentSection === 'trash' ? (
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
              onClearAll={() =>
                requestConfirm({
                  title: 'Empty trash permanently?',
                  body: `All ${trashedCollections.length} trashed ${pluralize(
                    trashedCollections.length,
                    'collection',
                  )} and every saved tab inside them will be erased from this browser profile. This cannot be undone.`,
                  confirmLabel: 'Empty trash',
                  tone: 'danger',
                  onConfirm: () =>
                    void runMutation(
                      () =>
                        permanentlyDeleteCollections(
                          database,
                          trashedCollections.map((c) => c.id),
                        ),
                      'Trash emptied.',
                    ),
                })
              }
            />
          ) : currentSection === 'collection' ? (
            selectedCollection ? (
              <CollectionDetail
                collection={selectedCollection}
                busy={busy}
                onCollect={() => void collectAll()}
                renaming={renaming}
                renameValue={renameValue}
                onRenameValueChange={setRenameValue}
                onStartRename={() => setRenaming(true)}
                onCancelRename={() => {
                  setRenaming(false);
                  setRenameValue(selectedCollection.name);
                }}
                onSubmitRename={(e) => {
                  e.preventDefault();
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
                renameInputRef={renameInputRef}
                onRestoreCollection={() =>
                  void restore(selectedCollection.tabs, 'saved tabs', true)
                }
                onTrashCollection={() =>
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
                query={query}
                onQueryChange={setQuery}
                selectedTabs={selectedTabs}
                visibleTabs={visibleTabs}
                onToggleSelectAll={() => {
                  if (
                    selectedTabs.size === visibleTabs.length &&
                    visibleTabs.length > 0
                  ) {
                    setSelectedTabs(new Set());
                  } else {
                    setSelectedTabs(new Set(visibleTabs.map((t) => t.id)));
                  }
                }}
                sortOrder={sortOrder}
                onSortOrderChange={(val) => setSortOrder(val)}
                view={view}
                onViewChange={applyView}
                onOpenTagManager={() => setTagManagerOpen(true)}
                tagFilter={tagFilter}
                onTagFilterChange={setTagFilter}
                onToggleTab={toggleTab}
                onRestoreTab={(tab) =>
                  void restore(
                    selectedCollection.tabs.filter((c) => c.id === tab.id),
                    'tab',
                  )
                }
                onDeleteTab={(tab) =>
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
                onEditTab={(tab) => {
                  setEditingTab(tab);
                  setEditTitle(tab.title);
                  setEditUrl(tab.url);
                }}
                onPinTab={(tab) =>
                  void runMutation(
                    () =>
                      updateTab(database, tab.id, {
                        pinned: !tab.pinned,
                      }),
                    tab.pinned ? 'Tab unpinned.' : 'Tab pinned.',
                    false,
                  )
                }
                onDragStartTab={(tabId) => setDraggingTabId(tabId)}
                onDragEndTab={() => setDraggingTabId(undefined)}
              />
            ) : null
          ) : null}
        </main>
      </div>

      {selectedTabs.size > 0 &&
        selectedCollection &&
        currentSection === 'collection' && (
          <BulkBar
            count={selectedTabs.size}
            busy={busy}
            collections={activeCollections.filter(
              (collection) => collection.id !== selectedCollection.id,
            )}
            tags={selectedCollection.tags}
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

      {selectedCollection && (
        <TagManagerModal
          isOpen={tagManagerOpen}
          collection={selectedCollection}
          onClose={() => setTagManagerOpen(false)}
          onCreateTag={async (name, color) => {
            await runMutation(
              async () => {
                await createTag(database, selectedCollection.id, name, color);
              },
              'Tag added.',
              false,
            );
          }}
          onUpdateTag={async (tagId, name, color) => {
            await runMutation(
              () => updateTag(database, tagId, { name, color }),
              'Tag updated.',
              false,
            );
          }}
          onDeleteTag={async (tagId) => {
            await runMutation(
              () => deleteTag(database, tagId),
              'Tag deleted.',
              false,
            );
          }}
        />
      )}

      <CollectModal
        isOpen={collectDialogOpen}
        busy={busy}
        name={collectName}
        onNameChange={setCollectName}
        onClose={() => setCollectDialogOpen(false)}
        onConfirm={() =>
          void performCollect(
            collectName.trim() ||
              `Collected ${new Date().toLocaleDateString()}`,
          )
        }
      />

      <EditTabModal
        tab={editingTab}
        title={editTitle}
        onTitleChange={setEditTitle}
        url={editUrl}
        onUrlChange={setEditUrl}
        onClose={() => setEditingTab(undefined)}
        onSave={() => {
          if (!editingTab) return;
          void runMutation(
            async () => {
              await updateTab(database, editingTab.id, {
                title: editTitle,
                url: editUrl,
              });
              setEditingTab(undefined);
            },
            'Tab updated.',
            false,
          );
        }}
      />

      {selectedCollection && (
        <EditCollectionModal
          isOpen={collectionEditorOpen}
          name={editCollectionName}
          onNameChange={setEditCollectionName}
          description={editCollectionDescription}
          onDescriptionChange={setEditCollectionDescription}
          color={editCollectionColor}
          onColorChange={setEditCollectionColor}
          onClose={() => setCollectionEditorOpen(false)}
          onSave={() =>
            void runMutation(
              async () => {
                await updateCollection(database, selectedCollection.id, {
                  name: editCollectionName,
                  description: editCollectionDescription,
                  color: editCollectionColor || null,
                });
                setCollectionEditorOpen(false);
              },
              'Collection updated.',
              false,
            )
          }
        />
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

      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
