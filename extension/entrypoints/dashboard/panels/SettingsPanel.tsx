import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { Settings } from '../../../src/schema';
import {
  FolderIcon,
  GridIcon,
  ShieldIcon,
  SunIcon,
  ZapIcon,
} from '../../../src/ui/icons';
import { modifierKey } from '../../../src/ui/platform';

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

  const handleUpdate = (updater: (prev: Settings) => Settings) => {
    setDraft((prev) => {
      const next = updater(prev);
      onSave(next);
      return next;
    });
  };

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
    </section>
  );
}
