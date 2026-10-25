import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { CheckIcon, ChevronDownIcon } from './icons';

export interface CustomSelectOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  hint?: string;
}

export interface CustomSelectProps<T extends string = string> {
  value: T;
  options: CustomSelectOption<T>[];
  onChange: (val: T) => void;
  ariaLabel?: string;
  className?: string;
  direction?: 'down' | 'up';
  size?: 'sm' | 'md';
}

export function CustomSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
  direction = 'down',
  size = 'md',
}: CustomSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption =
    options.find((opt) => opt.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className={`custom-select-wrap ${size === 'sm' ? 'custom-select-sm' : ''} ${className}`}
    >
      <button
        type="button"
        className={`custom-select-trigger ${open ? 'is-open' : ''}`}
        aria-label={ariaLabel || selectedOption?.label}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="custom-select-trigger-label">
          {selectedOption?.icon && (
            <span className="custom-select-trigger-icon" aria-hidden="true">
              {selectedOption.icon}
            </span>
          )}
          <span>{selectedOption?.label}</span>
        </span>
        <span
          className={`custom-select-chevron ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <ChevronDownIcon size={12} />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className={`custom-select-menu ${direction === 'up' ? 'direction-up' : 'direction-down'}`}
            role="listbox"
            aria-label={ariaLabel}
            initial={{
              opacity: 0,
              y: direction === 'up' ? 6 : -6,
              scale: 0.96,
            }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{
              opacity: 0,
              y: direction === 'up' ? 4 : -4,
              scale: 0.96,
            }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  type="button"
                  key={opt.value}
                  className={`custom-select-option ${isSelected ? 'selected' : ''}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <span className="custom-select-option-content">
                    {opt.icon && (
                      <span
                        className="custom-select-option-icon"
                        aria-hidden="true"
                      >
                        {opt.icon}
                      </span>
                    )}
                    <span className="custom-select-option-text">
                      <span className="custom-select-option-label">
                        {opt.label}
                      </span>
                      {opt.hint && (
                        <span className="custom-select-option-hint">
                          {opt.hint}
                        </span>
                      )}
                    </span>
                  </span>
                  {isSelected && (
                    <span className="custom-select-check" aria-hidden="true">
                      <CheckIcon size={13} />
                    </span>
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
