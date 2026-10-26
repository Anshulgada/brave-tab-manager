import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { ChevronIcon, SearchIcon } from '../../../src/ui/icons';
import type { Command } from '../types';

export function CommandPalette({
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
