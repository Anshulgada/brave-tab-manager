import { cva, type VariantProps } from 'class-variance-authority';
import { type HTMLMotionProps, motion } from 'framer-motion';
import * as React from 'react';
import { cn } from '../../lib/utils';

export const buttonVariants = cva(
  'btn inline-flex items-center justify-center select-none',
  {
    variants: {
      variant: {
        default: 'btn-primary',
        primary: 'btn-primary',
        secondary: '',
        outline: '',
        ghost: 'btn-ghost',
        destructive: 'btn-danger',
        danger: 'btn-danger',
        link: 'bg-transparent border-0 text-[var(--brand)] hover:underline p-0 h-auto inline-flex',
      },
      size: {
        default: '',
        sm: 'btn-sm',
        lg: 'text-sm px-4 py-2.5',
        icon: 'btn-icon',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends Omit<HTMLMotionProps<'button'>, 'children'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  children?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, whileHover, whileTap, disabled, ...props },
    ref,
  ) => {
    return (
      <motion.button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled}
        whileHover={disabled ? undefined : (whileHover ?? { scale: 1.02 })}
        whileTap={disabled ? undefined : (whileTap ?? { scale: 0.97 })}
        transition={{ type: 'spring', stiffness: 500, damping: 28 }}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
