import { AnimatePresence, motion } from 'framer-motion';
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
import { PRODUCT_NAME } from '../../src/product';
import { sendSwitchboardRequest } from '../../src/runtime';
import type { Settings } from '../../src/schema';
import { CustomSelect } from '../../src/ui/CustomSelect';
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
  EditIcon,
  FolderIcon,
  GridIcon,
  HelpIcon,
  HomeIcon,
  LayersIcon,
  LibraryIcon,
  ListIcon,
  MoonIcon,
  MoreIcon,
  PencilIcon,
  PinIcon,
  PinSlashIcon,
  PlusIcon,
  RenameIcon,
  RestoreIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  SparkIcon,
  SunIcon,
  TagIcon,
  TrashIcon,
  UploadIcon,
  WindowIcon,
  ZapIcon,
} from '../../src/ui/icons';
import { shortcut } from '../../src/ui/platform';
import { OrganizePanel, ProvidersPanel, WindowsPanel } from './panels';

const database = new TabmanDatabase();
const VIEW_STORAGE_KEY = 'tabman.library-view';

type Section =
  | 'home'
  | 'windows'
  | 'library'
  | 'organize'
  | 'providers'
  | 'rules'
  | 'trash'
  | 'settings'
  | 'collection';
type View = 'grid' | 'list';
type SortOrder = 'recent' | 'name' | 'domain' | 'tabs';

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
  const [snapshot, setSnapshot] = useState<LibrarySnapshot>();
  const [section, setSection] = useState<Section>('home');
  const [rules, setRules] = useState(DEFAULT_PREBUILT_RULES_JSONL);

  const navigateTo = useCallback((next: Section) => {
    setSection(next);
    setSelectedTabs(new Set());
    setQuery('');
    setMenuFor(undefined);
    if (next !== 'collection') {
      setSelectedCollectionId(undefined);
    }
  }, []);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>();
  const [menuFor, setMenuFor] = useState<string>();
  const [helpOpen, setHelpOpen] = useState(false);
  const [collectDialogOpen, setCollectDialogOpen] = useState(false);
  const [collectName, setCollectName] = useState('');
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('');
  const [renamingTagId, setRenamingTagId] = useState<string>();
  const [renamingTagName, setRenamingTagName] = useState('');
  const [renamingTagColor, setRenamingTagColor] = useState('');
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
    browser.runtime.onMessage.addListener(messageListener);
    document.addEventListener('visibilitychange', visibilityListener);
    return () => {
      browser.runtime.onMessage.removeListener(messageListener);
      document.removeEventListener('visibilitychange', visibilityListener);
    };
  }, [load]);

  useEffect(() => {
    if (!menuFor) {
      return;
    }
    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.rail-menu-popover, .rail-menu')) {
        return;
      }
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
        if (cmp !== 0) {
          return cmp;
        }
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
    async (
      tabs: LibraryCollection['tabs'],
      label: string,
      inNewWindow = false,
    ) => {
      if (busyRef.current) {
        return;
      }
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

  const collectAll = async () => {
    if (busyRef.current) {
      return;
    }
    const selected = selectedCollection;
    if (section === 'collection' && selected) {
      await performCollect(selected.name, selected.id);
      return;
    }
    setCollectName(`Collected ${new Date().toLocaleDateString()}`);
    setCollectDialogOpen(true);
  };

  const performCollect = async (name: string, collectionId?: string) => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setCollectDialogOpen(false);
    try {
      const response = await sendSwitchboardRequest({
        type: 'library/collect',
        name,
        collectionId,
      });
      if (!response.ok) {
        throw new Error(response.error);
      }
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
        setSelectedCollectionId(response.collectionId);
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
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
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
    navigateTo,
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
            {currentTheme === 'dark' ? <MoonIcon /> : <SunIcon />}
          </button>
          <button
            className="btn btn-ghost btn-icon"
            type="button"
            title="Help & Concepts Guide"
            aria-label="Help & Concepts Guide"
            onClick={() => setHelpOpen(true)}
          >
            <HelpIcon />
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
              className={section === 'home' ? 'rail-link active' : 'rail-link'}
              type="button"
              onClick={() => navigateTo('home')}
            >
              <HomeIcon />
              <span>Home</span>
            </button>
            <button
              className={
                section === 'windows' ? 'rail-link active' : 'rail-link'
              }
              type="button"
              onClick={() => navigateTo('windows')}
            >
              <WindowIcon />
              <span>Windows</span>
            </button>
            <button
              className={
                section === 'organize' ? 'rail-link active' : 'rail-link'
              }
              type="button"
              onClick={() => navigateTo('organize')}
            >
              <LayersIcon />
              <span>Organize</span>
            </button>
            <button
              className={
                section === 'providers' ? 'rail-link active' : 'rail-link'
              }
              type="button"
              onClick={() => navigateTo('providers')}
            >
              <ZapIcon />
              <span>Providers</span>
            </button>
            <button
              className={section === 'rules' ? 'rail-link active' : 'rail-link'}
              type="button"
              onClick={() => navigateTo('rules')}
            >
              <LayersIcon />
              <span>Rules</span>
            </button>
            <button
              className={section === 'trash' ? 'rail-link active' : 'rail-link'}
              type="button"
              onClick={() => navigateTo('trash')}
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
              onClick={() => navigateTo('settings')}
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
                onClick={() => setCreating(true)}
              >
                <PlusIcon size={14} />
              </button>
            </div>

            {creating && (
              <form
                ref={createFormRef}
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
                      onClick={() => {
                        setSelectedCollectionId(collection.id);
                        setTagFilter('');
                        setSelectedTabs(new Set());
                        setSection('collection');
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
                    <button
                      className="rail-menu"
                      type="button"
                      title="Collection actions"
                      aria-label={`Actions for ${collection.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setMenuFor((current) =>
                          current === collection.id ? undefined : collection.id,
                        );
                      }}
                    >
                      <MoreIcon size={18} />
                    </button>
                    {menuFor === collection.id && (
                      <div className="rail-menu-popover" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuFor(undefined);
                            setSelectedCollectionId(collection.id);
                            setCollectionEditorOpen(true);
                            setEditCollectionName(collection.name);
                            setEditCollectionDescription(
                              collection.description ?? '',
                            );
                            setEditCollectionColor(collection.color ?? '');
                          }}
                        >
                          <EditIcon size={13} />
                          Edit details
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuFor(undefined);
                            setSelectedCollectionId(collection.id);
                            setRenaming(true);
                          }}
                        >
                          <RenameIcon size={13} />
                          Rename
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="danger"
                          onClick={() => {
                            setMenuFor(undefined);
                            if (
                              window.confirm(
                                `Move "${collection.name}" to the trash?`,
                              )
                            ) {
                              void runMutation(
                                () =>
                                  setCollectionStatus(
                                    database,
                                    [collection.id],
                                    'trashed',
                                  ),
                                'Collection moved to trash.',
                              );
                            }
                          }}
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

        <main className="content">
          {loading ? (
            <LoadingState />
          ) : section === 'home' || section === 'library' ? (
            <HomePanel
              collections={activeCollections}
              savedTabCount={savedTabCount}
              tagCount={tagCount}
              onCollect={() => void collectAll()}
              onCreate={() => setCreating(true)}
              onSelectCollection={(id) => {
                setSelectedCollectionId(id);
                setTagFilter('');
                setSelectedTabs(new Set());
                setSection('collection');
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
          ) : section === 'windows' ? (
            <WindowsPanel onNotify={pushToast} />
          ) : section === 'settings' ? (
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
          ) : section === 'providers' ? (
            <ProvidersPanel onNotify={pushToast} />
          ) : section === 'organize' ? (
            <OrganizePanel
              rules={rules}
              onNotify={pushToast}
              onApplied={() => {
                void load();
                setSection('home');
              }}
            />
          ) : section === 'rules' ? (
            <RulesPanel rules={rules} onChange={setRules} />
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
          ) : section === 'collection' ? (
            selectedCollection ? (
              <>
                <CollectBar busy={busy} onCollect={() => void collectAll()} />

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
                          onChange={(event) =>
                            setRenameValue(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                              setRenaming(false);
                              setRenameValue(selectedCollection.name);
                            }
                          }}
                        />
                        <button
                          className="btn btn-primary btn-sm"
                          type="submit"
                        >
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
                        <PencilIcon size={15} />
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
                        void restore(
                          selectedCollection.tabs,
                          'saved tabs',
                          true,
                        )
                      }
                    >
                      <RestoreIcon size={15} />
                      Restore in new window
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

                <section className="collection-toolbar-redesigned">
                  <div className="collection-toolbar-main">
                    <div className="collection-toolbar-left">
                      <div className="collection-search-wrap">
                        <SearchIcon size={14} />
                        <input
                          type="search"
                          className="collection-search-input"
                          placeholder={`Search ${selectedCollection.tabs.length} tabs...`}
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          aria-label="Search tabs in this collection"
                        />
                        {query && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => setQuery('')}
                            aria-label="Clear search"
                          >
                            <CloseIcon size={12} />
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          if (
                            selectedTabs.size === visibleTabs.length &&
                            visibleTabs.length > 0
                          ) {
                            setSelectedTabs(new Set());
                          } else {
                            setSelectedTabs(
                              new Set(visibleTabs.map((t) => t.id)),
                            );
                          }
                        }}
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
                        {visibleTabs.length} of {selectedCollection.tabs.length}{' '}
                        tabs
                      </span>
                      <CustomSelect<SortOrder>
                        value={sortOrder}
                        options={[
                          { value: 'recent', label: 'Most recent' },
                          { value: 'name', label: 'Title (A–Z)' },
                          { value: 'domain', label: 'Domain (A–Z)' },
                          { value: 'tabs', label: 'Park order' },
                        ]}
                        onChange={(val) => setSortOrder(val)}
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
                          onClick={() => applyView('grid')}
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
                          onClick={() => applyView('list')}
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
                      onClick={() => setTagManagerOpen(true)}
                    >
                      <TagIcon size={13} />
                      Manage tags
                    </button>
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
                      setQuery('');
                      setTagFilter('');
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
                            onEdit={() => {
                              setEditingTab(tab);
                              setEditTitle(tab.title);
                              setEditUrl(tab.url);
                            }}
                            onPin={() =>
                              void runMutation(
                                () =>
                                  updateTab(database, tab.id, {
                                    pinned: !tab.pinned,
                                  }),
                                tab.pinned ? 'Tab unpinned.' : 'Tab pinned.',
                                false,
                              )
                            }
                            onDragStart={() => setDraggingTabId(tab.id)}
                            onDragEnd={() => setDraggingTabId(undefined)}
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
                            onEdit={() => {
                              setEditingTab(tab);
                              setEditTitle(tab.title);
                              setEditUrl(tab.url);
                            }}
                            onPin={() =>
                              void runMutation(
                                () =>
                                  updateTab(database, tab.id, {
                                    pinned: !tab.pinned,
                                  }),
                                tab.pinned ? 'Tab unpinned.' : 'Tab pinned.',
                                false,
                              )
                            }
                            onDragStart={() => setDraggingTabId(tab.id)}
                            onDragEnd={() => setDraggingTabId(undefined)}
                          />
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </>
            ) : null
          ) : null}
        </main>
      </div>

      {selectedTabs.size > 0 &&
        selectedCollection &&
        (section === 'collection' || section === 'library') && (
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

      {tagManagerOpen && selectedCollection && (
        <div className="overlay">
          <button
            className="overlay-backdrop"
            type="button"
            aria-label="Close"
            onClick={() => setTagManagerOpen(false)}
          />
          <div
            className="dialog dialog-wide"
            role="dialog"
            aria-modal="true"
            aria-label="Manage tags"
          >
            <h2>Tags in {selectedCollection.name}</h2>
            <p className="settings-intro">
              Tags are scoped to this collection. Names are case insensitive.
            </p>
            <ul className="tag-manager-list">
              {selectedCollection.tags.map((tag) => (
                <li key={tag.id}>
                  {renamingTagId === tag.id ? (
                    <>
                      <input
                        className="input"
                        maxLength={64}
                        value={renamingTagName}
                        onChange={(event) =>
                          setRenamingTagName(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            setRenamingTagId(undefined);
                          }
                        }}
                      />
                      <div className="color-swatches color-swatches-sm">
                        {[
                          '',
                          '#ef4444',
                          '#f97316',
                          '#eab308',
                          '#22c55e',
                          '#06b6d4',
                          '#3b82f6',
                          '#8b5cf6',
                          '#ec4899',
                        ]
                          .filter((color) => {
                            if (!color) return true;
                            const usedByOther = selectedCollection.tags.some(
                              (t) => t.id !== tag.id && t.color === color,
                            );
                            return !usedByOther;
                          })
                          .map((color) => (
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
                        onClick={() =>
                          void runMutation(
                            async () => {
                              await updateTag(database, tag.id, {
                                name: renamingTagName,
                                color: renamingTagColor || null,
                              });
                            },
                            'Tag updated.',
                            false,
                          ).then(() => setRenamingTagId(undefined))
                        }
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
                          onClick={() =>
                            void runMutation(
                              () => deleteTag(database, tag.id),
                              'Tag deleted.',
                              false,
                            )
                          }
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
              onSubmit={(event) => {
                event.preventDefault();
                void runMutation(
                  async () => {
                    await createTag(
                      database,
                      selectedCollection.id,
                      newTagName,
                      newTagColor || null,
                    );
                    setNewTagName('');
                    setNewTagColor('');
                  },
                  'Tag added.',
                  false,
                );
              }}
            >
              <input
                className="input"
                aria-label="New tag name"
                maxLength={64}
                placeholder="New tag name"
                value={newTagName}
                onChange={(event) => setNewTagName(event.target.value)}
              />
              <div className="color-swatches color-swatches-sm">
                {[
                  '',
                  '#ef4444',
                  '#f97316',
                  '#eab308',
                  '#22c55e',
                  '#06b6d4',
                  '#3b82f6',
                  '#8b5cf6',
                  '#ec4899',
                ]
                  .filter((color) => {
                    if (!color) return true;
                    const used = selectedCollection.tags.some(
                      (t) => t.color === color,
                    );
                    return !used;
                  })
                  .map((color) => (
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
              <button
                className="btn"
                type="button"
                onClick={() => setTagManagerOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {collectDialogOpen && (
        <div className="overlay">
          <button
            className="overlay-backdrop"
            type="button"
            aria-label="Close"
            onClick={() => setCollectDialogOpen(false)}
          />
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Collect open tabs"
          >
            <h2>Collect open tabs</h2>
            <p className="settings-intro">
              Name the new collection for these tabs.
            </p>
            <label className="field">
              <span>Collection name</span>
              <input
                className="input"
                maxLength={120}
                value={collectName}
                onChange={(event) => setCollectName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void performCollect(
                      collectName.trim() ||
                        `Collected ${new Date().toLocaleDateString()}`,
                    );
                  }
                }}
              />
            </label>
            <div className="dialog-actions">
              <button
                className="btn"
                type="button"
                onClick={() => setCollectDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy}
                onClick={() =>
                  void performCollect(
                    collectName.trim() ||
                      `Collected ${new Date().toLocaleDateString()}`,
                  )
                }
              >
                Collect
              </button>
            </div>
          </div>
        </div>
      )}

      {editingTab && (
        <div className="overlay">
          <button
            className="overlay-backdrop"
            type="button"
            aria-label="Close"
            onClick={() => setEditingTab(undefined)}
          />
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Edit tab"
          >
            <h2>Edit tab</h2>
            <label className="field">
              <span>Title</span>
              <input
                className="input"
                maxLength={240}
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
              />
            </label>
            <label className="field">
              <span>URL</span>
              <input
                className="input"
                value={editUrl}
                onChange={(event) => setEditUrl(event.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <button
                className="btn"
                type="button"
                onClick={() => setEditingTab(undefined)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={!editTitle.trim() || !editUrl.trim()}
                onClick={() =>
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
                  )
                }
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {collectionEditorOpen && selectedCollection && (
        <div className="overlay">
          <button
            className="overlay-backdrop"
            type="button"
            aria-label="Close"
            onClick={() => setCollectionEditorOpen(false)}
          />
          <div
            className="dialog dialog-wide"
            role="dialog"
            aria-modal="true"
            aria-label="Edit collection"
          >
            <h2>Edit collection</h2>
            <label className="field">
              <span>Name</span>
              <input
                className="input"
                maxLength={120}
                value={editCollectionName}
                onChange={(event) => setEditCollectionName(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Description</span>
              <textarea
                className="input"
                rows={3}
                maxLength={500}
                value={editCollectionDescription}
                onChange={(event) =>
                  setEditCollectionDescription(event.target.value)
                }
              />
            </label>
            <div className="field">
              <span>Color</span>
              <div className="color-swatches">
                {[
                  '',
                  '#ef4444',
                  '#f97316',
                  '#eab308',
                  '#22c55e',
                  '#06b6d4',
                  '#3b82f6',
                  '#8b5cf6',
                  '#ec4899',
                ].map((color) => (
                  <button
                    key={color || 'none'}
                    type="button"
                    className={
                      editCollectionColor === color
                        ? 'color-swatch selected'
                        : 'color-swatch'
                    }
                    style={color ? { background: color } : undefined}
                    aria-label={color || 'No color'}
                    onClick={() => setEditCollectionColor(color)}
                  />
                ))}
              </div>
            </div>
            <div className="dialog-actions">
              <button
                className="btn"
                type="button"
                onClick={() => setCollectionEditorOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={!editCollectionName.trim()}
                onClick={() =>
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
              >
                Save
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

      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}

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

function HomePanel({
  collections,
  savedTabCount,
  tagCount,
  onCollect,
  onCreate,
  onSelectCollection,
  onDeleteCollections,
}: {
  collections: LibraryCollection[];
  savedTabCount: number;
  tagCount: number;
  onCollect: () => void;
  onCreate: () => void;
  onSelectCollection: (id: string) => void;
  onDeleteCollections: (ids: string[]) => void;
}) {
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

type RuleItem = { id: string; name: string; patterns: string[] };

function parseRulesToItems(rulesText: string): RuleItem[] {
  if (!rulesText.trim()) return [];
  const lines = rulesText.trim().split('\n');
  const items: RuleItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      const name = String(
        obj.name || obj.group || obj.collectionName || `Rule ${i + 1}`,
      ).trim();
      const rawPatterns = Array.isArray(obj.patterns || obj.match)
        ? ((obj.patterns || obj.match) as string[])
        : [];
      items.push({
        id: `rule-${i}-${name}`,
        name: name || `Group ${i + 1}`,
        patterns: rawPatterns
          .map(String)
          .map((p) => p.trim())
          .filter(Boolean),
      });
    } catch {
      if (line.includes('->')) {
        const [pat, dest] = line.split('->').map((s) => s.trim());
        if (pat && dest) {
          items.push({ id: `rule-${i}-${dest}`, name: dest, patterns: [pat] });
        }
      } else if (line.includes(':')) {
        const [col, pats] = line.split(':').map((s) => s.trim());
        if (col && pats) {
          items.push({
            id: `rule-${i}-${col}`,
            name: col,
            patterns: pats
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          });
        }
      } else {
        items.push({
          id: `rule-${i}-gen`,
          name: 'General',
          patterns: [line],
        });
      }
    }
  }
  return items;
}

function serializeRulesToJSONL(rulesList: RuleItem[]): string {
  return rulesList
    .map((item) =>
      JSON.stringify({
        name: item.name.trim(),
        patterns: item.patterns.filter(Boolean),
      }),
    )
    .join('\n');
}

function RulesPanel({
  rules,
  onChange,
}: {
  rules: string;
  onChange: (v: string) => void;
}) {
  const [mode, setMode] = useState<'visual' | 'code'>('visual');
  const [items, setItems] = useState<RuleItem[]>(() =>
    parseRulesToItems(rules),
  );
  const [newGroupName, setNewGroupName] = useState('');
  const [newPatterns, setNewPatterns] = useState<Record<string, string>>({});
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    setItems(parseRulesToItems(rules));
  }, [rules]);

  const saveToStorage = (updatedRules: string) => {
    try {
      localStorage.setItem('tabman-local-rules', updatedRules);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);
    } catch {}
  };

  const updateItems = (nextItems: RuleItem[]) => {
    setItems(nextItems);
    const serialized = serializeRulesToJSONL(nextItems);
    onChange(serialized);
    saveToStorage(serialized);
  };

  const removeGroup = (groupId: string) => {
    updateItems(items.filter((item) => item.id !== groupId));
  };

  const removePattern = (groupId: string, patternIndex: number) => {
    updateItems(
      items.map((item) => {
        if (item.id !== groupId) return item;
        const nextPatterns = item.patterns.filter(
          (_, idx) => idx !== patternIndex,
        );
        return { ...item, patterns: nextPatterns };
      }),
    );
  };

  const addPattern = (groupId: string) => {
    const pat = (newPatterns[groupId] || '').trim();
    if (!pat) return;
    updateItems(
      items.map((item) => {
        if (item.id !== groupId) return item;
        return { ...item, patterns: [...item.patterns, pat] };
      }),
    );
    setNewPatterns((curr) => ({ ...curr, [groupId]: '' }));
  };

  const addGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    const newGroup: RuleItem = {
      id: `rule-${Date.now()}-${name}`,
      name,
      patterns: [],
    };
    updateItems([...items, newGroup]);
    setNewGroupName('');
  };

  const formatJSONL = () => {
    const parsed = parseRulesToItems(rules);
    const formatted = serializeRulesToJSONL(parsed);
    onChange(formatted);
    saveToStorage(formatted);
  };

  const resetToDefaults = () => {
    if (window.confirm('Reset all rules to the prebuilt default rules?')) {
      onChange(DEFAULT_PREBUILT_RULES_JSONL);
      saveToStorage(DEFAULT_PREBUILT_RULES_JSONL);
    }
  };

  const exportRules = () => {
    try {
      const blob = new Blob([rules], {
        type: 'application/x-jsonlines;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tabman-rules.jsonl';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {}
  };

  const importRules = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.jsonl,.json,.txt';
    input.onchange = (event) => {
      const target = event.target as HTMLInputElement | null;
      const file = target?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const content = String(reader.result ?? '');
          onChange(content);
          saveToStorage(content);
        } catch {}
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <section className="settings">
      <header className="settings-head">
        <p className="eyebrow">Organization</p>
        <h1>Local rules</h1>
        <p className="settings-intro">
          Match tabs into collections automatically using domain and URL
          patterns. Prebuilt with common services (AI, Media, Dev, Social).
        </p>
      </header>

      <div className="rules-toolbar">
        <div className="rules-toolbar-left">
          <div className="segmented-pill-track">
            <button
              type="button"
              className={`segmented-pill-btn ${
                mode === 'visual' ? 'active' : ''
              }`}
              aria-pressed={mode === 'visual'}
              onClick={() => setMode('visual')}
            >
              {mode === 'visual' && (
                <motion.div
                  layoutId="rulesModePill"
                  className="segmented-pill-slider"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span className="segmented-pill-text">Visual cards</span>
            </button>
            <button
              type="button"
              className={`segmented-pill-btn ${mode === 'code' ? 'active' : ''}`}
              aria-pressed={mode === 'code'}
              onClick={() => setMode('code')}
            >
              {mode === 'code' && (
                <motion.div
                  layoutId="rulesModePill"
                  className="segmented-pill-slider"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span className="segmented-pill-text">JSONL code</span>
            </button>
          </div>
          {savedToast && (
            <span
              style={{
                fontSize: '12px',
                color: 'var(--success, #22c55e)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <CheckIcon size={13} /> Rules saved
            </span>
          )}
        </div>

        <div className="rules-toolbar-right">
          {mode === 'code' && (
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={formatJSONL}
            >
              Format JSONL
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={resetToDefaults}
          >
            Reset to defaults
          </button>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={exportRules}
          >
            <DownloadIcon size={13} />
            Export
          </button>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={importRules}
          >
            <UploadIcon size={13} />
            Import
          </button>
        </div>
      </div>

      {mode === 'visual' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="rules-visual-grid">
            {items.map((item) => (
              <div className="rule-group-card" key={item.id}>
                <div className="rule-group-card-head">
                  <div className="rule-group-card-title">
                    <FolderIcon size={15} />
                    <span>{item.name}</span>
                  </div>
                  <button
                    type="button"
                    className="rule-group-delete-btn"
                    title={`Delete rule group "${item.name}"`}
                    aria-label={`Delete rule group ${item.name}`}
                    onClick={() => removeGroup(item.id)}
                  >
                    <CloseIcon size={14} />
                  </button>
                </div>

                <div className="rule-patterns-wrap">
                  {item.patterns.length === 0 ? (
                    <span
                      style={{ fontSize: '12px', color: 'var(--text-muted)' }}
                    >
                      No patterns yet. Add one below.
                    </span>
                  ) : (
                    item.patterns.map((pat, pIdx) => (
                      <span
                        className="rule-pattern-chip"
                        key={`${item.id}-${pat}`}
                      >
                        <span>{pat}</span>
                        <button
                          type="button"
                          className="rule-pattern-remove"
                          title={`Remove ${pat}`}
                          aria-label={`Remove pattern ${pat}`}
                          onClick={() => removePattern(item.id, pIdx)}
                        >
                          <CloseIcon size={11} />
                        </button>
                      </span>
                    ))
                  )}
                </div>

                <form
                  className="rule-pattern-add-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addPattern(item.id);
                  }}
                >
                  <input
                    className="input input-compact"
                    placeholder="e.g. *domain.com*"
                    value={newPatterns[item.id] || ''}
                    onChange={(e) =>
                      setNewPatterns({
                        ...newPatterns,
                        [item.id]: e.target.value,
                      })
                    }
                  />
                  <button
                    type="submit"
                    className="btn btn-sm"
                    disabled={!(newPatterns[item.id] || '').trim()}
                  >
                    <PlusIcon size={12} />
                    Add
                  </button>
                </form>
              </div>
            ))}
          </div>

          <div
            style={{
              background: 'var(--surface)',
              border: '1px dashed var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <input
              className="input"
              placeholder="New rule group name (e.g. Shopping, Finance)..."
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addGroup();
                }
              }}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!newGroupName.trim()}
              onClick={addGroup}
            >
              <PlusIcon size={14} />
              Add group
            </button>
          </div>
        </div>
      ) : (
        <div className="rules-code-editor">
          <textarea
            className="input"
            rows={12}
            placeholder='{"name": "AI", "patterns": ["*chatgpt.com*", "*claude.ai*"]}'
            value={rules}
            onChange={(e) => {
              onChange(e.target.value);
              saveToStorage(e.target.value);
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Format: One JSON object per line with <code>name</code> and{' '}
              <code>patterns</code> array.
            </span>
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={() => saveToStorage(rules)}
            >
              Save rules
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

interface TabCardProps {
  tab: LibraryCollection['tabs'][number];
  tags: { id: string; name: string; color?: string | null }[];
  selected: boolean;
  onToggle: () => void;
  onRestore: () => void;
  onEdit: () => void;
  onPin: () => void;
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
  onEdit,
  onPin,
  onDelete,
  onDragStart,
  onDragEnd,
}: TabCardProps) {
  const title = tabLabel(tab.title, tab.hostname, tab.url);
  const host = hostLabel(tab.hostname, tab.url);
  const tagColor = tags.find((t) => Boolean(t.color))?.color;

  return (
    <article
      className={[
        'tab-card',
        selected ? 'selected' : '',
        tab.pinned ? 'pinned' : '',
        tagColor ? 'has-tag-color' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        borderLeft: tagColor ? `4px solid ${tagColor}` : undefined,
      }}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', tab.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="tab-card-header">
        <div className="tab-card-source">
          <span className="tab-card-check-wrap">
            <input
              className="checkbox"
              type="checkbox"
              aria-label={`Select ${title}`}
              checked={selected}
              onChange={onToggle}
            />
          </span>
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
          <span className="tab-host" title={tab.hostname}>
            {host}
          </span>
          {tab.pinned && (
            <span className="tab-pinned-pill" title="Pinned tab">
              <PinIcon size={10} />
              <span>Pinned</span>
            </span>
          )}
        </div>

        <div className="tab-card-actions">
          <motion.button
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.85 }}
            className="tab-action-btn"
            type="button"
            title="Open in new window"
            aria-label="Open tab in new window"
            onClick={onRestore}
          >
            <ArrowUpRightIcon size={14} />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.85 }}
            className={`tab-action-btn ${tab.pinned ? 'is-pinned' : ''}`}
            type="button"
            title={tab.pinned ? 'Unpin this tab' : 'Pin this tab'}
            aria-label={tab.pinned ? 'Unpin this tab' : 'Pin this tab'}
            onClick={onPin}
          >
            {tab.pinned ? <PinSlashIcon size={14} /> : <PinIcon size={14} />}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.85 }}
            className="tab-action-btn"
            type="button"
            title="Edit this tab"
            aria-label="Edit this tab"
            onClick={onEdit}
          >
            <PencilIcon size={14} />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.85 }}
            className="tab-action-btn tab-action-delete"
            type="button"
            title="Delete this tab"
            aria-label="Delete this tab"
            onClick={onDelete}
          >
            <CloseIcon size={14} />
          </motion.button>
        </div>
      </div>

      <a
        className="tab-title"
        href={tab.url}
        target="_blank"
        rel="noreferrer"
        title={tab.url}
      >
        {title}
      </a>

      {tags.length > 0 && (
        <div className="tab-tags">
          {tags.map((tag) => (
            <span className="chip" key={tag.id}>
              {tag.color && (
                <span
                  className="tag-color-dot"
                  style={{ background: tag.color }}
                  aria-hidden="true"
                />
              )}
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
  onEdit,
  onPin,
  onDelete,
  onDragStart,
  onDragEnd,
}: TabCardProps) {
  const title = tabLabel(tab.title, tab.hostname, tab.url);
  const host = hostLabel(tab.hostname, tab.url);
  const tagColor = tags.find((t) => Boolean(t.color))?.color;

  return (
    <article
      className={[
        'tab-row',
        selected ? 'selected' : '',
        tab.pinned ? 'pinned' : '',
        tagColor ? 'has-tag-color' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        borderLeft: tagColor ? `4px solid ${tagColor}` : undefined,
      }}
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
            {tag.color && (
              <span
                className="tag-color-dot"
                style={{ background: tag.color }}
                aria-hidden="true"
              />
            )}
            {tag.name}
          </span>
        ))}
        {tab.pinned && (
          <span className="tab-pinned-pill" title="Pinned tab">
            <PinIcon size={10} />
          </span>
        )}
      </div>
      <div className="tab-row-actions">
        <motion.button
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.85 }}
          className="btn btn-ghost btn-icon btn-sm"
          type="button"
          title="Restore this tab"
          aria-label="Restore this tab"
          onClick={onRestore}
        >
          <ArrowUpRightIcon size={15} />
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.85 }}
          className={`btn btn-ghost btn-icon btn-sm ${tab.pinned ? 'is-pinned' : ''}`}
          type="button"
          title={tab.pinned ? 'Unpin this tab' : 'Pin this tab'}
          aria-label={tab.pinned ? 'Unpin this tab' : 'Pin this tab'}
          onClick={onPin}
        >
          {tab.pinned ? <PinSlashIcon size={15} /> : <PinIcon size={15} />}
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.85 }}
          className="btn btn-ghost btn-icon btn-sm"
          type="button"
          title="Edit this tab"
          aria-label="Edit this tab"
          onClick={onEdit}
        >
          <PencilIcon size={15} />
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.85 }}
          className="btn btn-ghost btn-icon btn-sm"
          type="button"
          title="Delete this tab"
          aria-label="Delete this tab"
          onClick={onDelete}
        >
          <CloseIcon size={15} />
        </motion.button>
      </div>
    </article>
  );
}

interface BulkBarProps {
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

function BulkBar({
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
  const [organizeMode, setOrganizeMode] = useState<'multiple' | 'single'>(
    () => {
      try {
        return (
          (localStorage.getItem('tabman-organize-mode') as
            | 'multiple'
            | 'single') || 'multiple'
        );
      } catch {
        return 'multiple';
      }
    },
  );

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
          <div className="segmented-pill-track">
            {(['system', 'light', 'dark'] as const).map((theme) => (
              <button
                type="button"
                key={theme}
                className={`segmented-pill-btn ${
                  draft.theme === theme ? 'active' : ''
                }`}
                aria-pressed={draft.theme === theme}
                onClick={() => {
                  setDraft({ ...draft, theme });
                  onApplyTheme(theme);
                }}
              >
                {draft.theme === theme && (
                  <motion.div
                    layoutId="settingsThemePill"
                    className="segmented-pill-slider"
                    transition={{
                      type: 'spring',
                      stiffness: 500,
                      damping: 35,
                    }}
                  />
                )}
                <span className="segmented-pill-text">
                  {theme === 'system'
                    ? 'System'
                    : theme === 'light'
                      ? 'Light'
                      : 'Dark'}
                </span>
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
          <div className="segmented-pill-track">
            {(['grid', 'list'] as const).map((defaultView) => (
              <button
                type="button"
                key={defaultView}
                className={`segmented-pill-btn ${
                  draft.defaultView === defaultView ? 'active' : ''
                }`}
                aria-pressed={draft.defaultView === defaultView}
                onClick={() => setDraft({ ...draft, defaultView })}
              >
                {draft.defaultView === defaultView && (
                  <motion.div
                    layoutId="settingsViewPill"
                    className="segmented-pill-slider"
                    transition={{
                      type: 'spring',
                      stiffness: 500,
                      damping: 35,
                    }}
                  />
                )}
                <span className="segmented-pill-text">
                  {defaultView === 'grid' ? 'Grid' : 'List'}
                </span>
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
              <FolderIcon size={16} />
            </span>
            <div>
              <h2>Organize destination</h2>
              <p>Default way organized tabs are saved to your library.</p>
            </div>
          </div>
          <div className="segmented-pill-track">
            <button
              type="button"
              className={`segmented-pill-btn ${
                organizeMode === 'multiple' ? 'active' : ''
              }`}
              aria-pressed={organizeMode === 'multiple'}
              onClick={() => {
                setOrganizeMode('multiple');
                try {
                  localStorage.setItem('tabman-organize-mode', 'multiple');
                } catch {}
              }}
            >
              {organizeMode === 'multiple' && (
                <motion.div
                  layoutId="settingsDestPill"
                  className="segmented-pill-slider"
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 35,
                  }}
                />
              )}
              <span className="segmented-pill-text">Separate collections</span>
            </button>
            <button
              type="button"
              className={`segmented-pill-btn ${
                organizeMode === 'single' ? 'active' : ''
              }`}
              aria-pressed={organizeMode === 'single'}
              onClick={() => {
                setOrganizeMode('single');
                try {
                  localStorage.setItem('tabman-organize-mode', 'single');
                } catch {}
              }}
            >
              {organizeMode === 'single' && (
                <motion.div
                  layoutId="settingsDestPill"
                  className="segmented-pill-slider"
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 35,
                  }}
                />
              )}
              <span className="segmented-pill-text">
                Single collection with tags
              </span>
            </button>
          </div>
          <p className="settings-note">
            {organizeMode === 'multiple'
              ? 'Creates a distinct collection for each group or domain rule.'
              : 'Puts all tabs into one dated collection and tags them with their group name.'}
          </p>
        </div>

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
  return (
    <section className="toast-stack" aria-label="Notifications">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            className={`toast toast-${toast.tone}`}
            key={toast.id}
            role="status"
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ duration: 0.2 }}
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
          </motion.div>
        ))}
      </AnimatePresence>
    </section>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="overlay">
      <button
        className="overlay-backdrop"
        type="button"
        aria-label="Close help"
        onClick={onClose}
      />
      <div
        className="dialog help-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Tabman Guide & Concepts"
      >
        <div className="dialog-head">
          <div className="dialog-title">
            <HelpIcon size={18} />
            <h2>Tabman Guide & Concepts</h2>
          </div>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon size={14} />
          </button>
        </div>
        <div className="help-modal-body">
          <div className="help-grid">
            <article className="help-topic">
              <div className="help-topic-head">
                <WindowIcon size={16} />
                <h3>Park Window</h3>
              </div>
              <p>
                Saves all open tabs from a specific browser window into a
                collection and closes that window in your browser to free up
                system RAM.
              </p>
            </article>

            <article className="help-topic">
              <div className="help-topic-head">
                <ZapIcon size={16} />
                <h3>Collect Tabs</h3>
              </div>
              <p>
                Takes a snapshot of every open tab across all windows and saves
                them into a collection without closing any of your browser
                windows.
              </p>
            </article>

            <article className="help-topic">
              <div className="help-topic-head">
                <LayersIcon size={16} />
                <h3>Local Rules vs AI</h3>
              </div>
              <p>
                <strong>Local Rules:</strong> Offline domain/path pattern
                matching.
                <br />
                <strong>AI Provider:</strong> Uses your OpenAI/Anthropic/custom
                LLM key to group tabs semantically.
              </p>
            </article>

            <article className="help-topic">
              <div className="help-topic-head">
                <FolderIcon size={16} />
                <h3>Single vs Multiple Collections</h3>
              </div>
              <p>
                Choose whether organization proposals create separate
                collections per category or group everything into one collection
                using tags.
              </p>
            </article>

            <article className="help-topic">
              <div className="help-topic-head">
                <GridIcon size={16} />
                <h3>Kanban Board Preview</h3>
              </div>
              <p>
                Preview organization proposals on an interactive drag-and-drop
                board. Move tabs between columns, collapse columns, or add
                custom groups before saving.
              </p>
            </article>

            <article className="help-topic">
              <div className="help-topic-head">
                <RestoreIcon size={16} />
                <h3>Restore Tabs</h3>
              </div>
              <p>
                Reopen entire collections or selected tabs in new windows with
                one click, restoring your saved sessions anytime.
              </p>
            </article>
          </div>
        </div>
        <div className="dialog-actions">
          <button className="btn btn-primary" type="button" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
