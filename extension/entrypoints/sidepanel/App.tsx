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

function tabLabel(tab: SwitchboardTab): string {
  return tab.title || tab.hostname || tab.url;
}

export function App() {
  const loadGeneration = useRef(0);
  const busyRef = useRef(false);
  const [snapshot, setSnapshot] = useState<SwitchboardSnapshot>();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [parkName, setParkName] = useState('');
  const [groupName, setGroupName] = useState('Tabman group');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const load = useCallback(async (options?: { clearActionError?: boolean }) => {
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
      if (options?.clearActionError) {
        setActionError(undefined);
      }
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
    void load({ clearActionError: true });
    const listener = (message: SwitchboardChangedMessage) => {
      if (message.type === 'switchboard/changed') {
        void load();
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [load]);

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
      setActionError(undefined);
      setNotice(undefined);
      try {
        const response = await sendSwitchboardRequest(request);
        if (!response.ok) {
          throw new Error(response.error);
        }
        const warnings =
          'warnings' in response ? (response.warnings ?? []) : [];
        setNotice(
          warnings.length > 0
            ? `${successMessage} ${warnings.join(' ')}`
            : successMessage,
        );
        setSelected(new Set());
        onSuccess?.();
        await load();
      } catch (mutationError) {
        setActionError(
          mutationError instanceof Error
            ? mutationError.message
            : 'The browser action failed',
        );
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [load],
  );

  const activate = useCallback(async (tab: SwitchboardTab) => {
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
      setNotice(undefined);
    } catch (activationError) {
      setActionError(
        activationError instanceof Error
          ? activationError.message
          : 'Could not focus the selected tab',
      );
    }
  }, []);

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
  const error = actionError ?? loadError;

  return (
    <main className="switchboard">
      <header className="app-header">
        <div>
          <p className="eyebrow">{PRODUCT_NAME}</p>
          <h1>Window switchboard</h1>
        </div>
        <button
          className="secondary compact"
          type="button"
          disabled={busy}
          onClick={() =>
            void runMutation({ type: 'dashboard/open' }, 'Library opened.')
          }
        >
          Library
        </button>
      </header>

      <label className="search">
        <span className="sr-only">Search every open tab</span>
        <input
          type="search"
          placeholder="Search every window…"
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
      </label>

      {snapshot && (
        <div className="summary" role="status" aria-label="Browser summary">
          <span>{snapshot.windows.length} windows</span>
          <span>{snapshot.tabCount} tabs</span>
          <span title="Duplicates share the same URL after ignoring hash, www, and a trailing slash. Query strings still count as distinct.">
            {snapshot.duplicateCount} duplicates
          </span>
        </div>
      )}

      {selected.size > 0 && (
        <section className="action-panel" aria-label="Selected tab actions">
          <strong>{selected.size} selected</strong>
          <div className="action-row">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    `Close ${selected.size} selected tab${selected.size === 1 ? '' : 's'}?`,
                  )
                ) {
                  void runMutation(
                    {
                      type: 'switchboard/action',
                      action: 'close',
                      tabIds: selectedIds,
                    },
                    'Selected tabs closed.',
                  );
                }
              }}
            >
              Close
            </button>
            <button
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
              Discard
            </button>
            <select
              aria-label="Move selected tabs to window"
              disabled={busy || targetWindows.length === 0}
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
          </div>
          <div className="named-action">
            <input
              aria-label="Tab group name"
              value={groupName}
              maxLength={64}
              onChange={(event) => setGroupName(event.target.value)}
            />
            <button
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
              Group
            </button>
          </div>
          <form
            className="named-action"
            onSubmit={(event) => {
              event.preventDefault();
              if (
                !window.confirm(
                  `Park ${selected.size} selected tab${selected.size === 1 ? '' : 's'} into the library and close them?`,
                )
              ) {
                return;
              }
              void runMutation(
                {
                  type: 'switchboard/park',
                  tabIds: selectedIds,
                  name: parkName,
                },
                'Selection parked in the library.',
                () => setParkName(''),
              );
            }}
          >
            <input
              aria-label="Collection name"
              placeholder="Collection name"
              value={parkName}
              maxLength={120}
              onChange={(event) => setParkName(event.target.value)}
            />
            <button type="submit" disabled={busy}>
              Park
            </button>
          </form>
        </section>
      )}

      {error && (
        <div className="status error" role="alert">
          <span>{error}</span>
          <button
            className="text-button"
            type="button"
            onClick={() => void load({ clearActionError: true })}
          >
            Retry
          </button>
        </div>
      )}
      {notice && (
        <p className="status success" role="status">
          {notice}
        </p>
      )}

      {loading ? (
        <div className="empty-state" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>Reading open windows…</p>
        </div>
      ) : loadError && !snapshot ? (
        <div className="empty-state">
          <h2>Could not read open windows</h2>
          <p>Retry after confirming the extension still has tabs permission.</p>
        </div>
      ) : visibleTabs.length === 0 ? (
        <div className="empty-state">
          <h2>{query ? 'No matching tabs' : 'No open tabs'}</h2>
          <p>
            {query
              ? 'Try a title, hostname, or URL.'
              : 'Open a browser tab and refresh the switchboard.'}
          </p>
        </div>
      ) : (
        <div className="window-list">
          {filtered?.windows.map((browserWindow) => (
            <section className="window-card" key={browserWindow.id}>
              <header className="window-header">
                <div>
                  <h2>
                    Window {browserWindow.id}
                    {browserWindow.focused && (
                      <>
                        <span className="live-dot" aria-hidden="true" />
                        <span className="sr-only">Focused window</span>
                      </>
                    )}
                  </h2>
                  <p>
                    {browserWindow.tabs.length} tab
                    {browserWindow.tabs.length === 1 ? '' : 's'}
                  </p>
                </div>
                <button
                  className="secondary compact"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const fullWindow = snapshot?.windows.find(
                      (window) => window.id === browserWindow.id,
                    );
                    const tabs = (fullWindow ?? browserWindow).tabs;
                    if (
                      !window.confirm(
                        `Park all ${tabs.length} tabs from window ${browserWindow.id} and close them?`,
                      )
                    ) {
                      return;
                    }
                    void runMutation(
                      {
                        type: 'switchboard/park',
                        tabIds: tabs.map((tab) => tab.id),
                        name: `Window ${browserWindow.id}`,
                      },
                      `Window ${browserWindow.id} parked.`,
                    );
                  }}
                >
                  Park window
                </button>
              </header>
              <div className="tab-list">
                {browserWindow.tabs.map((tab) => {
                  const absoluteIndex = visibleTabs.findIndex(
                    (item) => item.id === tab.id,
                  );
                  const isFocused = absoluteIndex === focusedIndex;
                  return (
                    <article
                      className={`tab-row${isFocused ? ' keyboard-focus' : ''}`}
                      key={tab.id}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Select ${tabLabel(tab)}`}
                        checked={selected.has(tab.id)}
                        onChange={() => toggleSelected(tab.id)}
                      />
                      {tab.favIconUrl ? (
                        <img
                          className="favicon"
                          src={tab.favIconUrl}
                          alt=""
                          onError={(event) => {
                            event.currentTarget.hidden = true;
                          }}
                        />
                      ) : (
                        <span className="favicon fallback" aria-hidden="true">
                          {tab.hostname.slice(0, 1).toLocaleUpperCase()}
                        </span>
                      )}
                      <button
                        className="tab-target"
                        type="button"
                        title={tab.url}
                        data-switchboard-index={absoluteIndex}
                        onFocus={() => setFocusedIndex(absoluteIndex)}
                        onKeyDown={(event) =>
                          onTabKeyDown(event, absoluteIndex)
                        }
                        onClick={() => void activate(tab)}
                      >
                        <strong>{tabLabel(tab)}</strong>
                        <span>{tab.hostname || tab.url}</span>
                      </button>
                      <div className="tab-badges">
                        {tab.duplicateCount > 1 && (
                          <span
                            title={`${tab.duplicateCount} matching tabs (hash, www, and trailing slash ignored)`}
                          >
                            ×{tab.duplicateCount}
                            <span className="sr-only">
                              {`${tab.duplicateCount} matching open tabs`}
                            </span>
                          </span>
                        )}
                        {tab.audible && (
                          <span title="Playing audio">
                            Audio
                            <span className="sr-only">Playing audio</span>
                          </span>
                        )}
                        {tab.discarded && (
                          <span title="Discarded">
                            Sleep
                            <span className="sr-only">Discarded tab</span>
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
    </main>
  );
}
