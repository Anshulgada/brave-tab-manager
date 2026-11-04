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

  const isHorizontalCenter = position === 'top' || position === 'bottom';
  const isVerticalCenter = position === 'left' || position === 'right';

  const initialX = isHorizontalCenter
    ? '-50%'
    : position === 'left'
      ? 4
      : position === 'right'
        ? -4
        : 0;
  const initialY =
    position === 'top'
      ? 4
      : position === 'bottom'
        ? -4
        : isVerticalCenter
          ? '-50%'
          : 0;

  const targetX = isHorizontalCenter ? '-50%' : 0;
  const targetY = isVerticalCenter ? '-50%' : 0;

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
              x: initialX,
              y: initialY,
            }}
            animate={{
              opacity: 1,
              scale: 1,
              x: targetX,
              y: targetY,
            }}
            exit={{
              opacity: 0,
              scale: 0.95,
              x: targetX,
              y: initialY,
            }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}
