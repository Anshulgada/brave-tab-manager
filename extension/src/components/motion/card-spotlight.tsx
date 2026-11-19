import type React from 'react';
import { useRef, useState } from 'react';
import { cn } from '../../lib/utils';

export function CardSpotlight({
  children,
  className,
  spotlightColor = 'rgba(124, 139, 255, 0.06)',
  radius = 180,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  spotlightColor?: string;
  radius?: number;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: decorative pointer spotlight container
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setOpacity(1)}
      onMouseLeave={() => setOpacity(0)}
      className={cn('relative', className)}
      {...props}
    >
      <div
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300 rounded-[inherit]"
        style={{
          opacity,
          background: `radial-gradient(${radius}px circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 70%)`,
        }}
      />
      {children}
    </div>
  );
}
