import type { ChangeEvent, RefObject } from 'react';
import { Button } from '../../../src/components/ui/button';
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
  const isDark =
    currentTheme === 'dark' ||
    (currentTheme === 'system' &&
      typeof window !== 'undefined' &&
      Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches));

  return (
    <header className="topbar">
      <div className="brand">
        <img
          src="/logo.png"
          alt={PRODUCT_NAME}
          className="brand-logo"
          width="44"
          height="44"
        />
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
        <Button
          variant="ghost"
          size="icon"
          type="button"
          title="Import an export"
          aria-label="Import an export"
          onClick={() => importInputRef.current?.click()}
        >
          <UploadIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          title="Export the library"
          aria-label="Export the library"
          onClick={onExport}
        >
          <DownloadIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          title={
            isDark ? 'Switch to the light theme' : 'Switch to the dark theme'
          }
          aria-label={
            isDark ? 'Switch to the light theme' : 'Switch to the dark theme'
          }
          onClick={onToggleTheme}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          title="Help & Concepts Guide"
          aria-label="Help & Concepts Guide"
          onClick={onOpenHelp}
        >
          <HelpIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          title="Preferences"
          aria-label="Preferences"
          onClick={onOpenSettings}
        >
          <SettingsIcon />
        </Button>
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
