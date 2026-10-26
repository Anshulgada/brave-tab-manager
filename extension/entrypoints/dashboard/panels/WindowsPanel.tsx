import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SwitchboardChangedMessage } from '../../../src/messages';
import { sendSwitchboardRequest } from '../../../src/runtime';
import {
  filterSwitchboard,
  type SwitchboardSnapshot,
  type SwitchboardTab,
} from '../../../src/switchboard';
import {
  hostInitial,
  hostLabel,
  pluralize,
  tabLabel,
} from '../../../src/ui/format';
import {
  CloseIcon,
  LayersIcon,
  SearchIcon,
  WindowIcon,
  ZapIcon,
} from '../../../src/ui/icons';
import type { PanelProps } from '../types';

export function WindowsPanel({ onNotify }: PanelProps) {
  const [snapshot, setSnapshot] = useState<SwitchboardSnapshot>();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await sendSwitchboardRequest({
        type: 'switchboard/get',
      });
      if (!response.ok) {
        throw new Error(response.error);
      }
      if ('snapshot' in response) {
        setSnapshot(response.snapshot);
      }
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Could not load windows',
        'danger',
      );
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    void load();
    const listener = (msg: SwitchboardChangedMessage) => {
      if (msg.type === 'switchboard/changed') {
        void load();
      }
    };
    if (typeof browser !== 'undefined' && browser.runtime?.onMessage) {
      browser.runtime.onMessage.addListener(listener);
    }
    return () => {
      if (typeof browser !== 'undefined' && browser.runtime?.onMessage) {
        browser.runtime.onMessage.removeListener(listener);
      }
    };
  }, [load]);

  const filtered = useMemo(
    () => (snapshot ? filterSwitchboard(snapshot, query) : undefined),
    [query, snapshot],
  );

  const activateTab = async (tab: SwitchboardTab) => {
    try {
      const response = await sendSwitchboardRequest({
        type: 'switchboard/activate',
        tabId: tab.id,
        windowId: tab.windowId,
      });
      if (!response.ok) {
        throw new Error(response.error);
      }
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Could not activate tab',
        'danger',
      );
    }
  };

  const closeTab = async (tabId: number) => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await sendSwitchboardRequest({
        type: 'switchboard/action',
        action: 'close',
        tabIds: [tabId],
      });
      if (!response.ok) {
        throw new Error(response.error);
      }
      onNotify('Tab closed', 'success');
      await load();
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Could not close tab',
        'danger',
      );
    } finally {
      setBusy(false);
    }
  };

  const [parkConfirm, setParkConfirm] = useState<{
    windowId: number;
    tabIds: number[];
  }>();

  const parkWindow = async (
    windowId: number,
    tabIds: number[],
    closeTabs = true,
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await sendSwitchboardRequest({
        type: 'switchboard/park',
        tabIds,
        name: `Window ${windowId}`,
        closeTabs,
      });
      if (!response.ok) {
        throw new Error(response.error);
      }
      onNotify(
        closeTabs
          ? `Window ${windowId} saved and closed`
          : `Window ${windowId} saved to library`,
        'success',
      );
      await load();
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Could not park window',
        'danger',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="windows-section">
      <header className="settings-head">
        <p className="eyebrow">Switchboard</p>
        <h1>Open Windows & Tabs</h1>
        <p className="settings-intro">
          View and manage open tabs segregated by browser window. Focus tabs,
          close them, or park whole windows into your library.
        </p>
      </header>

      {snapshot && (
        <div className="windows-summary">
          <span className="chip">
            <WindowIcon size={14} />
            {snapshot.windows.length}{' '}
            {pluralize(snapshot.windows.length, 'window')}
          </span>
          <span className="chip">
            <LayersIcon size={14} />
            {snapshot.tabCount} {pluralize(snapshot.tabCount, 'tab')}
          </span>
          {snapshot.duplicateCount > 0 && (
            <span className="chip chip-warning">
              <ZapIcon size={14} />
              {snapshot.duplicateCount} duplicate
              {snapshot.duplicateCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
      )}

      <div className="windows-filter">
        <input
          className="input"
          type="search"
          placeholder="Filter tabs across windows..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => setQuery('')}
          >
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="empty">
          <span className="spinner" aria-hidden="true" />
          <p>Reading open windows…</p>
        </div>
      ) : !filtered || filtered.windows.length === 0 ? (
        <div className="empty">
          <span className="empty-mark" aria-hidden="true">
            <SearchIcon size={22} />
          </span>
          <h2>{query ? 'No matching tabs found' : 'No open windows'}</h2>
          <p>
            {query
              ? 'Try a different search term.'
              : 'Open tabs in your browser to see them here.'}
          </p>
        </div>
      ) : (
        <div className="windows-list">
          {filtered.windows.map((win) => (
            <article className="window-card" key={win.id}>
              <header className="window-card-head">
                <div className="window-card-title">
                  <WindowIcon size={16} />
                  <h2>Window {win.id}</h2>
                  {win.focused && (
                    <span
                      className="current-window-badge"
                      title="Active/Focused Window"
                    >
                      <span className="current-window-dot" />
                      <span>Current window</span>
                    </span>
                  )}
                  <span className="window-tab-count">
                    {win.tabs.length} {pluralize(win.tabs.length, 'tab')}
                  </span>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    setParkConfirm({
                      windowId: win.id,
                      tabIds: win.tabs.map((t) => t.id),
                    })
                  }
                >
                  Park window
                </button>
              </header>

              <div className="window-card-tabs">
                {win.tabs.map((tab) => (
                  <div className="window-tab-item" key={tab.id}>
                    {tab.favIconUrl ? (
                      <img
                        className="tab-favicon"
                        src={tab.favIconUrl}
                        alt=""
                        onError={(e) => {
                          e.currentTarget.hidden = true;
                        }}
                      />
                    ) : (
                      <span className="tab-favicon fallback" aria-hidden="true">
                        {hostInitial(tab.hostname, tab.url)}
                      </span>
                    )}

                    <button
                      className="window-tab-btn"
                      type="button"
                      title={tab.url}
                      onClick={() => void activateTab(tab)}
                    >
                      <strong className="window-tab-title">
                        {tabLabel(tab.title, tab.hostname, tab.url)}
                      </strong>
                      <span className="window-tab-host">
                        {hostLabel(tab.hostname, tab.url)}
                      </span>
                    </button>

                    <div className="window-tab-meta">
                      {tab.duplicateCount > 1 && (
                        <span
                          className="chip chip-warning chip-xs"
                          title="Duplicate tab"
                        >
                          ×{tab.duplicateCount}
                        </span>
                      )}
                      {tab.audible && (
                        <span className="chip chip-xs" title="Audio playing">
                          Audio
                        </span>
                      )}
                      {tab.discarded && (
                        <span className="chip chip-xs" title="Discarded tab">
                          Sleep
                        </span>
                      )}
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        type="button"
                        title="Close tab"
                        disabled={busy}
                        onClick={() => void closeTab(tab.id)}
                      >
                        <CloseIcon size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      {parkConfirm && (
        <div className="overlay">
          <button
            className="overlay-backdrop"
            type="button"
            aria-label="Cancel"
            onClick={() => setParkConfirm(undefined)}
          />
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Park Window ${parkConfirm.windowId}`}
          >
            <h2>Park Window {parkConfirm.windowId}?</h2>
            <p>
              Save all {parkConfirm.tabIds.length}{' '}
              {pluralize(parkConfirm.tabIds.length, 'tab')} from this window
              into a collection in your library.
            </p>
            <div className="dialog-actions">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setParkConfirm(undefined)}
              >
                Cancel
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  const target = parkConfirm;
                  setParkConfirm(undefined);
                  void parkWindow(target.windowId, target.tabIds, false);
                }}
              >
                Keep window open
              </button>
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => {
                  const target = parkConfirm;
                  setParkConfirm(undefined);
                  void parkWindow(target.windowId, target.tabIds, true);
                }}
              >
                Close window
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
