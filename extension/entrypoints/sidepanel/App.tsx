import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { SwitchboardChangedMessage } from '../../src/messages';
import { PRODUCT_NAME } from '../../src/product';
import { sendSwitchboardRequest } from '../../src/runtime';
import {
  filterSwitchboard,
  type SwitchboardSnapshot,
  type SwitchboardTab,
} from '../../src/switchboard';
import {
  hostInitial,
  hostLabel,
  pluralize,
  tabLabel,
} from '../../src/ui/format';
import {
  CheckIcon,
  CloseIcon,
  LayersIcon,
  LibraryIcon,
  MoonIcon,
  SearchIcon,
  SparkIcon,
  TagIcon,
  TrashIcon,
  WindowIcon,
  ZapIcon,
} from '../../src/ui/icons';

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

function useToasts() {
  const toastId = useRef(0);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = ++toastId.current;
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  return { toasts, push, dismiss };
}

export function App() {
  const loadGeneration = useRef(0);
  const busyRef = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const { toasts, push, dismiss } = useToasts();
  const [snapshot, setSnapshot] = useState<SwitchboardSnapshot>();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [parkName, setParkName] = useState('');
  const [groupName, setGroupName] = useState('Tabman group');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest>();

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    try {
      const response = await sendSwitchboardRequest({
        type: 'switchboard/get',
      });
      if (!response.ok) {
        throw new Error(response.error);
      }
      if (!('snapshot' in response)) {
        throw new Error('The switchboard response was incomplete');
      }
      if (generation !== loadGeneration.current) {
        return;
      }
      setSnapshot(response.snapshot);
      const liveTabIds = new Set(
        response.snapshot.windows.flatMap((window) =>
          window.tabs.map((tab) => tab.id),
        ),
      );
      setSelected(
        (current) =>
          new Set([...current].filter((tabId) => liveTabIds.has(tabId))),
      );
      setLoadError(undefined);
    } catch (error) {
      if (generation !== loadGeneration.current) {
        return;
      }
      setLoadError(
        error instanceof Error ? error.message : 'Could not load browser tabs',
      );
    } finally {
      if (generation === loadGeneration.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    const listener = (message: SwitchboardChangedMessage) => {
      if (message.type === 'switchboard/changed') {
        void load();
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [load]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === '/' && document.activeElement !== searchRef.current) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const filtered = useMemo(
    () => (snapshot ? filterSwitchboard(snapshot, query) : undefined),
    [query, snapshot],
  );
  const visibleTabs = useMemo(
    () => filtered?.windows.flatMap((window) => window.tabs) ?? [],
    [filtered],
  );

  const runMutation = useCallback(
    async (
      request: Parameters<typeof sendSwitchboardRequest>[0],
      successMessage: string,
      onSuccess?: () => void,
    ) => {
      if (busyRef.current) {
        return;
      }
      busyRef.current = true;
      setBusy(true);
      try {
        const response = await sendSwitchboardRequest(request);
        if (!response.ok) {
          throw new Error(response.error);
        }
        const warnings =
          'warnings' in response ? (response.warnings ?? []) : [];
        push(
          warnings.length > 0
            ? `${successMessage} ${warnings.join(' ')}`
            : successMessage,
          'success',
        );
        setSelected(new Set());
        onSuccess?.();
        await load();
      } catch (mutationError) {
        push(
          mutationError instanceof Error
            ? mutationError.message
            : 'The browser action failed',
          'danger',
        );
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [load, push],
  );

  const activate = useCallback(
    async (tab: SwitchboardTab) => {
      if (busyRef.current) {
        return;
      }
      try {
        const response = await sendSwitchboardRequest({
          type: 'switchboard/activate',
          tabId: tab.id,
          windowId: tab.windowId,
        });
        if (!response.ok) {
          throw new Error(response.error);
        }
      } catch (activationError) {
        push(
          activationError instanceof Error
            ? activationError.message
            : 'Could not focus the selected tab',
          'danger',
        );
      }
    },
    [push],
  );

  const toggleSelected = (tabId: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(tabId)) {
        next.delete(tabId);
      } else {
        next.add(tabId);
      }
      return next;
    });
  };

  const focusTabAt = (index: number) => {
    const nextIndex =
      (index + visibleTabs.length) % Math.max(visibleTabs.length, 1);
    setFocusedIndex(nextIndex);
    document
      .querySelector<HTMLButtonElement>(
        `[data-switchboard-index="${nextIndex}"]`,
      )
      ?.focus();
  };

  const onTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (visibleTabs.length === 0) {
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      focusTabAt(index + direction);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setSelected(new Set());
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      const tab = visibleTabs[index];
      if (tab) {
        toggleSelected(tab.id);
      }
    }
  };

  const selectedIds = [...selected];
  const targetWindows =
    snapshot?.windows.filter((window) =>
      window.tabs.some((tab) => !selected.has(tab.id)),
    ) ?? [];

  return (
    <div className="panel">
      <header className="panel-head">
        <div className="panel-brand">
          <span className="brand-mark" aria-hidden="true">
            T
          </span>
          <div>
            <strong>{PRODUCT_NAME}</strong>
            <span>Switchboard</span>
          </div>
        </div>
        <button
          className="btn btn-ghost btn-icon"
          type="button"
          title="Open the library"
          aria-label="Open the library"
          disabled={busy}
          onClick={() =>
            void runMutation({ type: 'dashboard/open' }, 'Library opened.')
          }
        >
          <LibraryIcon />
        </button>
      </header>

      <div className="panel-search">
        <SearchIcon size={15} />
        <input
          ref={searchRef}
          type="search"
          placeholder="Search every window…"
          aria-label="Search every open tab"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setFocusedIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              focusTabAt(0);
            }
            if (event.key === 'Escape') {
              setSelected(new Set());
            }
          }}
        />
        {query && (
          <button
            className="btn btn-ghost btn-icon btn-sm"
            type="button"
            title="Clear the search"
            aria-label="Clear the search"
            onClick={() => setQuery('')}
          >
            <CloseIcon size={13} />
          </button>
        )}
      </div>

      {snapshot && (
        <div
          className="panel-summary"
          role="status"
          aria-label="Browser summary"
        >
          <span className="chip">
            <WindowIcon size={13} />
            {snapshot.windows.length}{' '}
            {pluralize(snapshot.windows.length, 'window')}
          </span>
          <span className="chip">
            <LayersIcon size={13} />
            {snapshot.tabCount} {pluralize(snapshot.tabCount, 'tab')}
          </span>
          {snapshot.duplicateCount > 0 && (
            <span
              className="chip chip-warning"
              title="Duplicates share the same URL after ignoring the hash, www, and a trailing slash. Query strings still count as distinct."
            >
              <ZapIcon size={13} />
              {snapshot.duplicateCount} duplicate
              {snapshot.duplicateCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
      )}

      {loadError && !snapshot && (
        <div className="panel-state">
          <span className="state-mark" aria-hidden="true">
            <CloseIcon size={18} />
          </span>
          <strong>Could not read open windows</strong>
          <p>Check that the extension still has the tabs permission.</p>
          <button className="btn" type="button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="panel-state" aria-live="polite" aria-busy="true">
          <span className="spinner" aria-hidden="true" />
          <strong>Reading open windows…</strong>
        </div>
      ) : visibleTabs.length === 0 ? (
        <div className="panel-state">
          <span className="state-mark" aria-hidden="true">
            <SearchIcon size={18} />
          </span>
          <strong>{query ? 'No matching tabs' : 'No open tabs'}</strong>
          <p>
            {query
              ? 'Try a title, hostname, or URL.'
              : 'Open a browser tab and the switchboard updates itself.'}
          </p>
        </div>
      ) : (
        <div className="panel-windows">
          {filtered?.windows.map((browserWindow) => (
            <section className="window" key={browserWindow.id}>
              <header className="window-head">
                <div className="window-title">
                  <h2>
                    Window {browserWindow.id}
                    {browserWindow.focused && (
                      <span className="live-dot" title="Focused window" />
                    )}
                  </h2>
                  <span>
                    {browserWindow.tabs.length}{' '}
                    {pluralize(browserWindow.tabs.length, 'tab')}
                  </span>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const fullWindow = snapshot?.windows.find(
                      (window) => window.id === browserWindow.id,
                    );
                    const tabs = (fullWindow ?? browserWindow).tabs;
                    setConfirmRequest({
                      title: `Park window ${browserWindow.id}?`,
                      body: `All ${tabs.length} tabs in this window move into the library and the tabs close.`,
                      confirmLabel: 'Park window',
                      tone: 'brand',
                      onConfirm: () =>
                        void runMutation(
                          {
                            type: 'switchboard/park',
                            tabIds: tabs.map((tab) => tab.id),
                            name: `Window ${browserWindow.id}`,
                          },
                          `Window ${browserWindow.id} parked.`,
                        ),
                    });
                  }}
                >
                  Park
                </button>
              </header>

              <div className="window-tabs">
                {browserWindow.tabs.map((tab) => {
                  const absoluteIndex = visibleTabs.findIndex(
                    (item) => item.id === tab.id,
                  );
                  const isFocused = absoluteIndex === focusedIndex;
                  return (
                    <article
                      className={`panel-tab${isFocused ? ' is-focused' : ''}`}
                      key={tab.id}
                    >
                      <input
                        className="checkbox"
                        type="checkbox"
                        aria-label={`Select ${tabLabel(tab.title, tab.hostname, tab.url)}`}
                        checked={selected.has(tab.id)}
                        onChange={() => toggleSelected(tab.id)}
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
                        <span
                          className="tab-favicon fallback"
                          aria-hidden="true"
                        >
                          {hostInitial(tab.hostname, tab.url)}
                        </span>
                      )}
                      <button
                        className="panel-tab-target"
                        type="button"
                        title={tab.url}
                        data-switchboard-index={absoluteIndex}
                        onFocus={() => setFocusedIndex(absoluteIndex)}
                        onKeyDown={(event) =>
                          onTabKeyDown(event, absoluteIndex)
                        }
                        onClick={() => void activate(tab)}
                      >
                        <strong>
                          {tabLabel(tab.title, tab.hostname, tab.url)}
                        </strong>
                        <span>{hostLabel(tab.hostname, tab.url)}</span>
                      </button>
                      <div className="panel-tab-badges">
                        {tab.duplicateCount > 1 && (
                          <span
                            className="badge badge-warning"
                            title={`${tab.duplicateCount} matching tabs (hash, www, and trailing slash ignored)`}
                          >
                            ×{tab.duplicateCount}
                          </span>
                        )}
                        {tab.audible && (
                          <span className="badge" title="Playing audio">
                            Audio
                          </span>
                        )}
                        {tab.discarded && (
                          <span className="badge" title="Discarded tab">
                            Sleep
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {selected.size > 0 && (
        <section className="panel-actions" aria-label="Selected tab actions">
          <div className="panel-actions-head">
            <span className="bulk-count">
              <CheckIcon size={13} />
              {selected.size} selected
            </span>
            <button
              className="btn btn-ghost btn-icon btn-sm"
              type="button"
              title="Clear the selection"
              aria-label="Clear the selection"
              onClick={() => setSelected(new Set())}
            >
              <CloseIcon size={13} />
            </button>
          </div>
          <div className="panel-action-row">
            <button
              className="btn btn-sm"
              type="button"
              disabled={busy}
              onClick={() =>
                setConfirmRequest({
                  title: `Close ${selected.size} ${pluralize(selected.size, 'tab')}?`,
                  body: 'The open tabs close in the browser.',
                  confirmLabel: 'Close tabs',
                  tone: 'danger',
                  onConfirm: () =>
                    void runMutation(
                      {
                        type: 'switchboard/action',
                        action: 'close',
                        tabIds: selectedIds,
                      },
                      'Selected tabs closed.',
                    ),
                })
              }
            >
              <TrashIcon size={14} />
              Close
            </button>
            <button
              className="btn btn-sm"
              type="button"
              disabled={busy}
              onClick={() =>
                void runMutation(
                  {
                    type: 'switchboard/action',
                    action: 'discard',
                    tabIds: selectedIds,
                  },
                  'Selected tabs discarded.',
                )
              }
            >
              <MoonIcon size={14} />
              Discard
            </button>
            {targetWindows.length > 0 && (
              <select
                className="select select-compact"
                aria-label="Move the selected tabs to a window"
                disabled={busy}
                defaultValue=""
                onChange={(event) => {
                  const windowId = Number(event.target.value);
                  if (Number.isInteger(windowId)) {
                    void runMutation(
                      {
                        type: 'switchboard/move',
                        tabIds: selectedIds,
                        windowId,
                      },
                      'Selected tabs moved.',
                    );
                  }
                  event.target.value = '';
                }}
              >
                <option value="" disabled>
                  Move to…
                </option>
                {targetWindows.map((window) => (
                  <option key={window.id} value={window.id}>
                    Window {window.id}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="panel-action-row">
            <input
              className="input"
              aria-label="Collection name"
              placeholder="Park into…"
              maxLength={120}
              value={parkName}
              onChange={(event) => setParkName(event.target.value)}
            />
            <button
              className="btn btn-primary btn-sm"
              type="button"
              disabled={busy || !parkName.trim()}
              onClick={() =>
                setConfirmRequest({
                  title: `Park ${selected.size} ${pluralize(selected.size, 'tab')}?`,
                  body: 'The tabs move into the library and close in the browser.',
                  confirmLabel: 'Park tabs',
                  tone: 'brand',
                  onConfirm: () =>
                    void runMutation(
                      {
                        type: 'switchboard/park',
                        tabIds: selectedIds,
                        name: parkName,
                      },
                      'Selection parked in the library.',
                      () => setParkName(''),
                    ),
                })
              }
            >
              <SparkIcon size={14} />
              Park
            </button>
          </div>
          <div className="panel-action-row">
            <input
              className="input"
              aria-label="Tab group name"
              placeholder="Group name"
              maxLength={64}
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
            />
            <button
              className="btn btn-sm"
              type="button"
              disabled={busy}
              onClick={() =>
                void runMutation(
                  {
                    type: 'switchboard/group',
                    tabIds: selectedIds,
                    title: groupName,
                  },
                  'Selected tabs grouped per window.',
                )
              }
            >
              <TagIcon size={14} />
              Group
            </button>
          </div>
        </section>
      )}

      {confirmRequest && (
        <div className="overlay">
          <button
            className="overlay-backdrop"
            type="button"
            aria-label="Cancel"
            onClick={() => setConfirmRequest(undefined)}
          />
          <div
            className="dialog"
            role="alertdialog"
            aria-modal="true"
            aria-label={confirmRequest.title}
          >
            <h2>{confirmRequest.title}</h2>
            <p>{confirmRequest.body}</p>
            <div className="dialog-actions">
              <button
                className="btn"
                type="button"
                onClick={() => setConfirmRequest(undefined)}
              >
                Cancel
              </button>
              <button
                className={
                  confirmRequest.tone === 'danger'
                    ? 'btn btn-danger'
                    : 'btn btn-primary'
                }
                type="button"
                onClick={() => {
                  confirmRequest.onConfirm();
                  setConfirmRequest(undefined);
                }}
              >
                {confirmRequest.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {toasts.length > 0 && (
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
                onClick={() => dismiss(toast.id)}
              >
                <CloseIcon size={13} />
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
