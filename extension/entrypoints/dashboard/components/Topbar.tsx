import type { ChangeEvent, RefObject } from 'react';
import { PRODUCT_NAME } from '../../../src/product';
import {
  DownloadIcon,
  HelpIcon,
  MoonIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  UploadIcon,
} from '../../../src/ui/icons';
import { shortcut } from '../../../src/ui/platform';

export interface TopbarProps {
  currentTheme: string;
  importInputRef: RefObject<HTMLInputElement | null>;
  onOpenPalette: () => void;
  onImportFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onExport: () => void;
  onToggleTheme: () => void;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
}

export function Topbar({
  currentTheme,
  importInputRef,
  onOpenPalette,
  onImportFile,
  onExport,
  onToggleTheme,
  onOpenHelp,
  onOpenSettings,
}: TopbarProps) {
  return (
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

      <button className="palette-trigger" type="button" onClick={onOpenPalette}>
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
          onClick={() => importInputRef.current?.click()}
        >
          <UploadIcon />
        </button>
        <button
          className="btn btn-ghost btn-icon"
          type="button"
          title="Export the library"
          aria-label="Export the library"
          onClick={onExport}
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
          onClick={onToggleTheme}
        >
          {currentTheme === 'dark' ? <MoonIcon /> : <SunIcon />}
        </button>
        <button
          className="btn btn-ghost btn-icon"
          type="button"
          title="Help & Concepts Guide"
          aria-label="Help & Concepts Guide"
          onClick={onOpenHelp}
        >
          <HelpIcon />
        </button>
        <button
          className="btn btn-ghost btn-icon"
          type="button"
          title="Preferences"
          aria-label="Preferences"
          onClick={onOpenSettings}
        >
          <SettingsIcon />
        </button>
      </div>

      <input
        ref={importInputRef}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        aria-label="Choose a Tabman JSON export"
        tabIndex={-1}
        onChange={onImportFile}
      />
    </header>
  );
}
