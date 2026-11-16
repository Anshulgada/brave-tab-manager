import { Command } from 'cmdk';
import { motion } from 'framer-motion';
import React, { useEffect } from 'react';
import { cn } from '../../lib/utils';
import { CloseIcon, SearchIcon } from '../../ui/icons';

export interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children?: React.ReactNode;
}

export function CommandMenu({
  open,
  onOpenChange,
  children,
}: CommandMenuProps) {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="overlay"
      style={{
        paddingTop: '14vh',
        zIndex: 60,
      }}
    >
      {/* Backdrop */}
      <button
        type="button"
        className="overlay-backdrop"
        onClick={() => onOpenChange(false)}
        aria-label="Close command palette"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -8 }}
        transition={{ duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}
        className="palette"
        style={{
          width: 'min(560px, calc(100vw - 32px))',
          background: 'var(--canvas-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
          zIndex: 1,
        }}
      >
        <Command className="flex flex-col w-full h-full">
          <div
            className="palette-input"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '13px 15px',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <SearchIcon size={15} />
            <Command.Input
              autoFocus
              placeholder="Search collections and commands..."
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: '14px',
                color: 'var(--text)',
                fontFamily: 'inherit',
              }}
            />
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="btn btn-ghost btn-icon"
              style={{ padding: '4px' }}
              aria-label="Close"
            >
              <CloseIcon size={14} />
            </button>
          </div>

          <Command.List
            className="palette-list"
            style={{
              maxHeight: '46vh',
              overflowY: 'auto',
              padding: '6px',
              listStyle: 'none',
              margin: 0,
            }}
          >
            <Command.Empty
              className="palette-empty"
              style={{
                padding: '16px',
                textAlign: 'center',
                color: 'var(--text-faint)',
                fontSize: '13px',
              }}
            >
              No matching collections or commands found.
            </Command.Empty>
            {children}
          </Command.List>
        </Command>
      </motion.div>
    </div>
  );
}

export const CommandItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Command.Item>
>(({ className, style, ...props }, ref) => (
  <Command.Item
    ref={ref}
    className={cn('palette-item', className)}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '9px 10px',
      borderRadius: 'var(--radius-md)',
      fontSize: '13.5px',
      color: 'var(--text-soft)',
      cursor: 'pointer',
      width: '100%',
      border: 'none',
      background: 'transparent',
      ...style,
    }}
    {...props}
  />
));
CommandItem.displayName = 'CommandItem';

export const CommandGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Command.Group>
>(({ className, style, ...props }, ref) => (
  <Command.Group
    ref={ref}
    className={className}
    style={{
      padding: '4px 0',
      ...style,
    }}
    {...props}
  />
));
CommandGroup.displayName = 'CommandGroup';
