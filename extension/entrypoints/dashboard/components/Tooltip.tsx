import { AnimatePresence, motion } from 'framer-motion';
import { type ReactNode, useEffect, useRef, useState } from 'react';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  delayMs?: number;
  maxWidth?: number | string;
}

export function Tooltip({
  content,
  children,
  position = 'top',
  className = '',
  delayMs = 150,
  maxWidth = 320,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delayMs);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const positionStyles: Record<string, string> = {
    top: 'tooltip-bubble-top',
    bottom: 'tooltip-bubble-bottom',
    left: 'tooltip-bubble-left',
    right: 'tooltip-bubble-right',
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: tooltip hover trigger wrapper
    <span
      className={`tooltip-trigger-wrap ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      <AnimatePresence>
        {isVisible && content && (
          <motion.div
            role="tooltip"
            className={`tooltip-bubble ${positionStyles[position] || 'tooltip-bubble-top'}`}
            style={{ maxWidth }}
            initial={{
              opacity: 0,
              scale: 0.95,
              y: position === 'top' ? 4 : position === 'bottom' ? -4 : 0,
            }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}
