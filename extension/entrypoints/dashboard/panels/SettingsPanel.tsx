import { useState } from 'react';
import { AnimatedTabs } from '../../../src/components/motion/animated-tabs';
import { Button } from '../../../src/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../src/components/ui/dialog';
import { Switch } from '../../../src/components/ui/switch';
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
import { APP_VERSION } from '../../../src/version';

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
        const latest = data.info?.version || APP_VERSION;
        const currentParts = APP_VERSION.split('.').map(Number);
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
        setUpdateStatus({ current: APP_VERSION, latest, hasUpdate });
      } else {
        setUpdateStatus({
          current: APP_VERSION,
          latest: APP_VERSION,
          hasUpdate: false,
        });
      }
    } catch {
      setUpdateStatus({
        current: APP_VERSION,
        latest: APP_VERSION,
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
          <Button
            type="button"
            variant="default"
            disabled={updateChecking}
            onClick={() => void handleCheckUpdates()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 16px',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            <RefreshIcon
              size={14}
              className={updateChecking ? 'benchmark-spin' : ''}
            />
            {updateChecking ? 'Checking Updates...' : 'Check for Updates'}
          </Button>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            v{APP_VERSION} · CLI Vault &amp; WASM Engine
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
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    onClick={() => setShowUpdateModal(true)}
                  >
                    Upgrade
                  </Button>
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
          <AnimatedTabs<'system' | 'light' | 'dark'>
            tabs={[
              { id: 'system', label: 'System' },
              { id: 'light', label: 'Light' },
              { id: 'dark', label: 'Dark' },
            ]}
            activeTab={draft.theme}
            onChange={(theme: 'system' | 'light' | 'dark') => {
              onApplyTheme(theme);
              handleUpdate((prev) => ({ ...prev, theme }));
            }}
            layoutId="settingsThemePill"
            size="default"
            className="w-full flex"
            tabClassName="flex-1"
          />
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
          <AnimatedTabs<'grid' | 'list'>
            tabs={[
              { id: 'grid', label: 'Grid' },
              { id: 'list', label: 'List' },
            ]}
            activeTab={draft.defaultView}
            onChange={(defaultView: 'grid' | 'list') =>
              handleUpdate((prev) => ({ ...prev, defaultView }))
            }
            layoutId="settingsViewPill"
            size="default"
            className="w-full flex"
            tabClassName="flex-1"
          />
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
          <div className="settings-toggle">
            <span>Include full URLs in AI requests</span>
            <Switch
              checked={draft.includeFullUrlInAi}
              onCheckedChange={(checked: boolean) =>
                handleUpdate((prev) => ({
                  ...prev,
                  includeFullUrlInAi: checked,
                }))
              }
              aria-label="Include full URLs in AI requests"
            />
          </div>
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
          <AnimatedTabs<'single' | 'multiple'>
            tabs={[
              { id: 'single', label: 'Single collection with tags' },
              { id: 'multiple', label: 'Separate collections' },
            ]}
            activeTab={organizeMode}
            onChange={(val: 'single' | 'multiple') => {
              setOrganizeMode(val);
              try {
                localStorage.setItem('tabman-organize-mode', val);
              } catch {}
            }}
            layoutId="settingsDestPill"
            size="default"
            className="w-full flex"
            tabClassName="flex-1"
          />
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
            <Switch
              checked={draft.enableRichPreviews ?? false}
              onCheckedChange={(checked: boolean) => {
                handleUpdate((prev) => ({
                  ...prev,
                  enableRichPreviews: checked,
                }));
              }}
              aria-label="Toggle rich visual preview cards"
            />
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
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={iframelyTesting || !draft.iframelyApiKey}
                onClick={() => void handleTestIframely()}
              >
                {iframelyTesting ? 'Testing...' : 'Test Key'}
              </Button>
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

      <Dialog open={showUpdateModal} onOpenChange={setShowUpdateModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upgrade Tabman</DialogTitle>
            <DialogDescription>
              Are you sure you want to upgrade Tabman from{' '}
              <strong className="text-foreground">v{APP_VERSION}</strong> to{' '}
              <strong className="text-brand">v{updateStatus?.latest}</strong>?
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            This will update your CLI vault and background acceleration services
            using your package manager.
          </p>
          {updateLog && (
            <pre className="text-xs p-2.5 rounded-lg bg-surface-muted border border-border whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
              {updateLog}
            </pre>
          )}
          <DialogFooter className="gap-2 sm:gap-0 mt-3">
            <Button
              variant="ghost"
              disabled={isUpdating}
              onClick={() => setShowUpdateModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              disabled={isUpdating}
              onClick={() => void handleConfirmUpgrade()}
            >
              {isUpdating ? 'Upgrading...' : 'Confirm & Upgrade'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
