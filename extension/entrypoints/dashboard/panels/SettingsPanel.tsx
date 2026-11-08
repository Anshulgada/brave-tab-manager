import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { testIframelyApiKey } from '../../../src/iframely';
import type { Settings } from '../../../src/schema';
import {
  ArrowUpRightIcon,
  CheckIcon,
  FolderIcon,
  GridIcon,
  RefreshIcon,
  ShieldIcon,
  SparkIcon,
  SunIcon,
  ZapIcon,
} from '../../../src/ui/icons';
import { modifierKey } from '../../../src/ui/platform';

const CURRENT_VERSION = '0.6.6';

export function SettingsPanel({
  settings,
  busy: _busy,
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
            | 'single') || 'single'
        );
      } catch {
        return 'single';
      }
    },
  );

  useEffect(() => setDraft(settings), [settings]);

  const [iframelyTesting, setIframelyTesting] = useState(false);
  const [iframelyStatus, setIframelyStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<{
    current: string;
    latest: string;
    hasUpdate: boolean;
  } | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateLog, setUpdateLog] = useState<string | null>(null);

  const handleUpdate = (updater: (prev: Settings) => Settings) => {
    setDraft((prev) => {
      const next = updater(prev);
      onSave(next);
      return next;
    });
  };

  const handleConfirmUpgrade = async () => {
    setIsUpdating(true);
    setUpdateLog(null);
    try {
      const ch = (
        globalThis as unknown as {
          chrome?: {
            runtime?: {
              sendNativeMessage?: (
                host: string,
                msg: unknown,
                cb: (resp: { status?: string; message?: string }) => void,
              ) => void;
            };
          };
        }
      ).chrome;

      if (ch?.runtime?.sendNativeMessage) {
        ch.runtime.sendNativeMessage(
          'com.tabman.sidecar',
          { type: 'upgrade' },
          (resp) => {
            setIsUpdating(false);
            if (resp?.status === 'ok') {
              setUpdateLog(
                resp.message || 'Upgrade successful! Restart Tabman.',
              );
            } else {
              setUpdateLog(
                'To complete: Run "tabman update" or "tabman upgrade" in your terminal.',
              );
            }
          },
        );
      } else {
        await new Promise((r) => setTimeout(r, 600));
        setIsUpdating(false);
        setUpdateLog(
          'Run "tabman update" in your terminal to upgrade automatically.',
        );
      }
    } catch {
      setIsUpdating(false);
      setUpdateLog(
        'Run "tabman update" in your terminal to upgrade automatically.',
      );
    }
  };

  const handleTestIframely = async () => {
    if (!draft.iframelyApiKey) {
      setIframelyStatus({
        ok: false,
        message: 'Enter your API key first',
      });
      return;
    }
    setIframelyTesting(true);
    setIframelyStatus(null);
    try {
      const result = await testIframelyApiKey(draft.iframelyApiKey);
      setIframelyStatus(result);
    } finally {
      setIframelyTesting(false);
    }
  };

  const handleCheckUpdates = async () => {
    setUpdateChecking(true);
    setUpdateStatus(null);
    try {
      const resp = await fetch('https://pypi.org/pypi/tabman/json', {
        headers: { Accept: 'application/json' },
      });
      if (resp.ok) {
        const data = (await resp.json()) as { info?: { version?: string } };
        const latest = data.info?.version || CURRENT_VERSION;
        const currentParts = CURRENT_VERSION.split('.').map(Number);
        const latestParts = latest.split('.').map(Number);
        let hasUpdate = false;
        for (
          let i = 0;
          i < Math.max(currentParts.length, latestParts.length);
          i++
        ) {
          const c = currentParts[i] || 0;
          const l = latestParts[i] || 0;
          if (l > c) {
            hasUpdate = true;
            break;
          }
          if (l < c) break;
        }
        setUpdateStatus({ current: CURRENT_VERSION, latest, hasUpdate });
      } else {
        setUpdateStatus({
          current: CURRENT_VERSION,
          latest: CURRENT_VERSION,
          hasUpdate: false,
        });
      }
    } catch {
      setUpdateStatus({
        current: CURRENT_VERSION,
        latest: CURRENT_VERSION,
        hasUpdate: false,
      });
    } finally {
      setUpdateChecking(false);
    }
  };

  return (
    <section className="settings">
      <header
        className="settings-head"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <p className="eyebrow">Preferences</p>
          <h1>Appearance and privacy</h1>
          <p className="settings-intro">
            Tabman keeps everything in this browser profile. Nothing is
            uploaded, and no page content is ever scraped.
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '6px',
          }}
        >
          <button
            type="button"
            className="btn btn-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 16px',
              fontSize: '13px',
              fontWeight: 600,
            }}
            disabled={updateChecking}
            onClick={() => void handleCheckUpdates()}
          >
            <RefreshIcon
              size={14}
              className={updateChecking ? 'benchmark-spin' : ''}
            />
            {updateChecking ? 'Checking Updates...' : 'Check for Updates'}
          </button>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            v{CURRENT_VERSION} · CLI Vault &amp; WASM Engine
          </span>
          {updateStatus && (
            <div
              style={{
                marginTop: '4px',
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                background: updateStatus.hasUpdate
                  ? 'color-mix(in srgb, var(--brand) 14%, transparent)'
                  : 'color-mix(in srgb, var(--success) 14%, transparent)',
                border: `1px solid ${
                  updateStatus.hasUpdate ? 'var(--brand)' : 'var(--success)'
                }`,
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {updateStatus.hasUpdate ? (
                <>
                  <span style={{ color: 'var(--brand-text)', fontWeight: 600 }}>
                    v{updateStatus.latest} available!
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => setShowUpdateModal(true)}
                  >
                    Upgrade
                  </button>
                </>
              ) : (
                <span
                  style={{
                    color: 'var(--success)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <CheckIcon size={12} /> Up to date
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="settings-grid">
        <div className="settings-card">
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
                  onApplyTheme(theme);
                  handleUpdate((prev) => ({ ...prev, theme }));
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
        </div>

        <div className="settings-card">
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
                onClick={() =>
                  handleUpdate((prev) => ({ ...prev, defaultView }))
                }
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
        </div>

        <div className="settings-card">
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
                handleUpdate((prev) => ({
                  ...prev,
                  includeFullUrlInAi: event.target.checked,
                }))
              }
            />
          </label>
          <p className="settings-note">
            Off sends only titles and hostnames. Tabman never reads the page
            body.
          </p>
        </div>

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
          </div>
          <p className="settings-note">
            {organizeMode === 'single'
              ? 'Puts all tabs into one dated collection and tags them with their group name.'
              : 'Creates a distinct collection for each group or domain rule.'}
          </p>
        </div>

        <div className="settings-card">
          <div
            className="settings-card-head"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}
          >
            <div style={{ display: 'flex', gap: '11px' }}>
              <span className="settings-icon">
                <SparkIcon size={16} />
              </span>
              <div>
                <h2>Rich Link Previews</h2>
                <p>Visual cards with covers, favicons, and metadata.</p>
              </div>
            </div>
            <label
              className="toggle-switch"
              title="Toggle rich visual preview cards"
            >
              <input
                type="checkbox"
                checked={draft.enableRichPreviews ?? false}
                onChange={(e) => {
                  const checked = e.target.checked;
                  handleUpdate((prev) => ({
                    ...prev,
                    enableRichPreviews: checked,
                  }));
                }}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              opacity: draft.enableRichPreviews ? 1 : 0.45,
              pointerEvents: draft.enableRichPreviews ? 'auto' : 'none',
              transition: 'opacity 0.15s ease',
            }}
          >
            <label
              htmlFor="iframely-api-key"
              style={{ fontSize: '12px', color: 'var(--text-muted)' }}
            >
              Personal API Key:
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                id="iframely-api-key"
                type="password"
                className="input"
                style={{ flex: 1, fontFamily: 'monospace' }}
                placeholder="Enter personal preview API key..."
                value={draft.iframelyApiKey ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  const trimmed = val.trim();
                  handleUpdate((prev) => ({
                    ...prev,
                    iframelyApiKey: trimmed ? trimmed : null,
                  }));
                }}
              />
              <button
                type="button"
                className="btn btn-sm"
                disabled={iframelyTesting || !draft.iframelyApiKey}
                onClick={() => void handleTestIframely()}
              >
                {iframelyTesting ? 'Testing...' : 'Test Key'}
              </button>
            </div>
            {iframelyStatus && (
              <p
                style={{
                  fontSize: '11.5px',
                  color: iframelyStatus.ok ? 'var(--success)' : 'var(--danger)',
                  marginTop: '2px',
                }}
              >
                {iframelyStatus.ok ? '✓ ' : '✕ '}
                {iframelyStatus.message}
              </p>
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '4px',
              }}
            >
              <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
                Offline permanent storage on device.
              </span>
              <a
                href="https://iframely.com"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11.5px',
                  color: 'var(--brand)',
                }}
              >
                Get an API key <ArrowUpRightIcon size={12} />
              </a>
            </div>
          </div>
        </div>

        <div className="settings-card">
          <div className="settings-card-head">
            <span className="settings-icon">
              <ZapIcon size={16} />
            </span>
            <div>
              <h2>Shortcuts</h2>
              <p>Quick keys for frequent actions.</p>
            </div>
          </div>
          <ul className="shortcut-list">
            <li>
              <span>Command palette</span>
              <div className="shortcut-keys">
                <kbd className="kbd">{modifierKey}</kbd>
                <kbd className="kbd">K</kbd>
              </div>
            </li>
            <li>
              <span>Open Tabman extension</span>
              <div className="shortcut-keys">
                <kbd className="kbd">{modifierKey}</kbd>
                <kbd className="kbd">Shift</kbd>
                <kbd className="kbd">O</kbd>
              </div>
            </li>
            <li>
              <span>Search inside collection</span>
              <div className="shortcut-keys">
                <kbd className="kbd">/</kbd>
                <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
                  or
                </span>
                <kbd className="kbd">{modifierKey}</kbd>
                <kbd className="kbd">F</kbd>
              </div>
            </li>
            <li>
              <span>Close modal or clear selection</span>
              <div className="shortcut-keys">
                <kbd className="kbd">Esc</kbd>
              </div>
            </li>
          </ul>
        </div>
      </div>

      {showUpdateModal && (
        <div className="overlay">
          <button
            className="overlay-backdrop"
            type="button"
            aria-label="Cancel"
            onClick={() => {
              if (!isUpdating) setShowUpdateModal(false);
            }}
          />
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Upgrade Tabman"
            style={{ width: '440px', maxWidth: 'calc(100vw - 32px)' }}
          >
            <h2>Upgrade Tabman</h2>
            <p>
              Are you sure you want to upgrade Tabman from{' '}
              <strong>v{CURRENT_VERSION}</strong> to{' '}
              <strong>v{updateStatus?.latest}</strong>?
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              This will update your CLI vault and background acceleration
              services using your package manager.
            </p>
            {updateLog && (
              <pre
                style={{
                  fontSize: '11px',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--border)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  marginTop: '4px',
                }}
              >
                {updateLog}
              </pre>
            )}
            <div className="dialog-actions" style={{ marginTop: '12px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={isUpdating}
                onClick={() => setShowUpdateModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={isUpdating}
                onClick={() => void handleConfirmUpgrade()}
              >
                {isUpdating ? 'Upgrading...' : 'Confirm & Upgrade'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
