import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '../../lib/utils';

export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors select-none',
  {
    variants: {
      variant: {
        default: 'bg-brand/15 text-brand border border-brand/25',
        brand: 'bg-brand text-white shadow-xs',
        secondary:
          'bg-secondary text-secondary-foreground border border-border',
        destructive: 'bg-danger/15 text-danger border border-danger/25',
        outline: 'border border-border text-foreground',
        success: 'bg-success/15 text-success border border-success/25',
        warning: 'bg-warning/15 text-warning border border-warning/25',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  pulse?: boolean;
}

export function Badge({
  className,
  variant,
  pulse = false,
  children,
  ...props
}: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {pulse && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
        </span>
      )}
      {children}
    </div>
  );
}
