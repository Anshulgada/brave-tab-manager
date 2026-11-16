import { motion } from 'framer-motion';
import type * as React from 'react';
import { cn } from '../../lib/utils';

export interface TabOption<T extends string = string> {
  id: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
}

export interface AnimatedTabsProps<T extends string = string> {
  tabs: Array<TabOption<T>>;
  activeTab: T;
  onChange: (id: T) => void;
  layoutId?: string;
  className?: string;
  tabClassName?: string;
  activeClassName?: string;
  size?: 'sm' | 'default' | 'lg';
}

export function AnimatedTabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  layoutId = 'animated-tabs-indicator',
  className,
  tabClassName,
  activeClassName,
}: AnimatedTabsProps<T>) {
  return (
    <div
      role="tablist"
      className={cn('segmented-pill-track', className)}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              'segmented-pill-btn',
              isActive && 'active',
              tabClassName,
            )}
          >
            {isActive && (
              <motion.div
                layoutId={layoutId}
                className={cn('segmented-pill-slider', activeClassName)}
                transition={{
                  type: 'spring',
                  stiffness: 500,
                  damping: 35,
                }}
              />
            )}
            {tab.icon && (
              <span className="shrink-0 relative z-[2]">{tab.icon}</span>
            )}
            <span className="segmented-pill-text">{tab.label}</span>
            {tab.badge && (
              <span className="shrink-0 relative z-[2]">{tab.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
