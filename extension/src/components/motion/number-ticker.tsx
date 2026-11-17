import NumberFlow from '@number-flow/react';
import { cn } from '../../lib/utils';

export interface NumberTickerProps {
  value: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  trend?: boolean;
}

export function NumberTicker({
  value,
  className,
  prefix,
  suffix,
}: NumberTickerProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center font-mono font-medium tracking-tight',
        className,
      )}
    >
      {prefix && <span className="mr-0.5">{prefix}</span>}
      <NumberFlow
        value={value}
        format={{ notation: 'standard' }}
        willChange
        animated
      />
      {suffix && <span className="ml-0.5">{suffix}</span>}
    </span>
  );
}
