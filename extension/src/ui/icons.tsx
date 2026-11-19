/** Small inline icon set so the UI does not need an icon dependency. */

import type { ReactNode } from 'react';

export type IconProps = {
  size?: number;
  className?: string;
};

function Icon({
  size = 16,
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  );
}

const stroke = {
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeWidth: 1.75,
} as const;

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" {...stroke} />
      <path d="m20 20-3.5-3.5" {...stroke} />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" {...stroke} />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M10 11v6M14 11v6" {...stroke} />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" {...stroke} />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" {...stroke} />
    </Icon>
  );
}

export function RestoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7" {...stroke} />
      <path d="M3 4v5h5" {...stroke} />
    </Icon>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4v11" {...stroke} />
      <path d="m8 11 4 4 4-4" {...stroke} />
      <path d="M5 19h14" {...stroke} />
    </Icon>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 20V9" {...stroke} />
      <path d="m8 13 4-4 4 4" {...stroke} />
      <path d="M5 5h14" {...stroke} />
    </Icon>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" {...stroke} />
      <rect x="13" y="4" width="7" height="7" rx="1.5" {...stroke} />
      <rect x="4" y="13" width="7" height="7" rx="1.5" {...stroke} />
      <rect x="13" y="13" width="7" height="7" rx="1.5" {...stroke} />
    </Icon>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 6h12M8 12h12M8 18h12" {...stroke} />
      <path d="M4 6h.01M4 12h.01M4 18h.01" {...stroke} />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h8M16 17h4" {...stroke} />
      <circle cx="16" cy="7" r="2" {...stroke} />
      <circle cx="8" cy="12" r="2" {...stroke} />
      <circle cx="14" cy="17" r="2" {...stroke} />
    </Icon>
  );
}

export function LibraryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 5h11a2 2 0 0 1 2 2v12" {...stroke} />
      <path d="M5 5v14a2 2 0 0 0 2 2h11" {...stroke} />
      <path d="M9 9h6M9 13h4" {...stroke} />
    </Icon>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4v4M12 16v4M4 12h4M16 12h4" {...stroke} />
      <path
        d="m7 7 2.5 2.5M14.5 14.5 17 17M17 7l-2.5 2.5M9.5 14.5 7 17"
        {...stroke}
      />
    </Icon>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" {...stroke} />
      <path
        d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"
        {...stroke}
      />
    </Icon>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" {...stroke} />
    </Icon>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M17 3 21 7 8 20H4v-4Z" {...stroke} />
      <path d="M15 5 19 9" {...stroke} />
    </Icon>
  );
}

export function ZapIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M13 2 4.5 13.5h6L9.5 22 19.5 10.5h-6.5L13 2Z"
        fill="currentColor"
        stroke="none"
      />
    </Icon>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <g transform="rotate(45 12 12)">
        <line x1="12" y1="15" x2="12" y2="22" {...stroke} strokeWidth={2} />
        <path
          d="M6 15h12v-2a2 2 0 0 0-.8-1.6L15.5 10V5h1a1.5 1.5 0 0 0 0-3h-9a1.5 1.5 0 0 0 0 3h1v5L6.8 11.4A2 2 0 0 0 6 13Z"
          {...stroke}
        />
      </g>
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 6 12 12M18 6 6 18" {...stroke} strokeWidth={2.25} />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12.5 4.5 4.5L19 7" {...stroke} strokeWidth={2.5} />
    </Icon>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9 6 6 6-6 6" {...stroke} />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" {...stroke} />
    </Icon>
  );
}

export function TagIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 11V5a1 1 0 0 1 1-1h6l9 9-7 7-9-9Z" {...stroke} />
      <path d="M8.5 8.5h.01" {...stroke} />
    </Icon>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M4 7a2 2 0 0 1 2-2h3.5l2 2H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"
        {...stroke}
      />
    </Icon>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M12 3.5 19 6v5.5c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6Z"
        {...stroke}
      />
      <path d="m9 12 2 2 4-4" {...stroke} />
    </Icon>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="6" r="2.5" fill="currentColor" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <circle cx="12" cy="18" r="2.5" fill="currentColor" />
    </Icon>
  );
}

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 17 17 7" {...stroke} />
      <path d="M9 7h8v8" {...stroke} />
    </Icon>
  );
}

export function WindowIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" {...stroke} />
      <path d="M3 9h18" {...stroke} />
    </Icon>
  );
}

export function LayersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 3 9 5-9 5-9-5Z" {...stroke} />
      <path d="m3 13 9 5 9-5" {...stroke} />
    </Icon>
  );
}

export function PinSlashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <g transform="rotate(45 12 12)">
        <line x1="12" y1="15" x2="12" y2="22" {...stroke} strokeWidth={2} />
        <path
          d="M6 15h12v-2a2 2 0 0 0-.8-1.6L15.5 10V5h1a1.5 1.5 0 0 0 0-3h-9a1.5 1.5 0 0 0 0 3h1v5L6.8 11.4A2 2 0 0 0 6 13Z"
          {...stroke}
        />
      </g>
      <line x1="4" y1="4" x2="20" y2="20" {...stroke} strokeWidth={2} />
    </Icon>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" {...stroke} />
      <polyline points="9 22 9 12 15 12 15 22" {...stroke} />
    </Icon>
  );
}

export function EditIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
        {...stroke}
      />
      <path
        d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
        {...stroke}
      />
    </Icon>
  );
}

export function RenameIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"
        {...stroke}
      />
      <polyline points="14 2 14 8 20 8" {...stroke} />
    </Icon>
  );
}

export function HardDriveIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <line x1="22" y1="12" x2="2" y2="12" {...stroke} />
      <path
        d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
        {...stroke}
      />
      <line x1="6" y1="16" x2="6.01" y2="16" {...stroke} />
      <line x1="10" y1="16" x2="10.01" y2="16" {...stroke} />
    </Icon>
  );
}

export function HelpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" {...stroke} />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" {...stroke} />
      <path d="M12 17h.01" {...stroke} />
    </Icon>
  );
}

export function HuggingFaceIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8 0-.46.04-.92.13-1.36.72.37 1.58.59 2.51.59 2.21 0 4.09-1.29 4.96-3.15.26-.05.53-.08.8-.08.27 0 .54.03.8.08.87 1.86 2.75 3.15 4.96 3.15.93 0 1.79-.22 2.51-.59.09.44.13.9.13 1.36 0 4.41-3.59 8-8 8zm-3.5-7c-.83 0-1.5-.67-1.5-1.5S7.67 10 8.5 10s1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm7 0c-.83 0-1.5-.67-1.5-1.5S14.67 10 15.5 10s1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM12 17.5c-2.33 0-4.32-1.45-5.12-3.5h10.24c-.8 2.05-2.79 3.5-5.12 3.5z" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" {...stroke} />
      <path d="M21 3v5h-5" {...stroke} />
    </Icon>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 19-7-7 7-7" {...stroke} />
      <path d="M19 12H5" {...stroke} />
    </Icon>
  );
}

export function TrophyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M6 3h12v6a6 6 0 0 1-5 5.92V17h3a1 1 0 0 1 0 2h-1.07c-.45 1.72-1.92 3-3.93 3s-3.48-1.28-3.93-3H7a1 1 0 0 1 0-2h3v-2.08A6 6 0 0 1 6 9V3Zm-1 2H3a2 2 0 0 0-2 2v1a4 4 0 0 0 4 4h1V5Zm14 0v7h1a4 4 0 0 0 4-4V7a2 2 0 0 0-2-2h-3Z"
        fill="currentColor"
        stroke="none"
      />
    </Icon>
  );
}

export function MedalIcon(props: IconProps) {
  return (
    <Icon {...props}>
      {/* Ribbons */}
      <path
        d="M7.2 2h3.1l2.2 4.5L10 8.2 7.2 2Zm9.6 0h-3.1L11.5 6.5 14 8.2l2.8-6.2Z"
        fill="currentColor"
        opacity="0.8"
        stroke="none"
      />
      {/* Center ribbon */}
      <path
        d="M10.2 2h3.6l-1.8 4.2-1.8-4.2Z"
        fill="currentColor"
        opacity="0.95"
        stroke="none"
      />
      {/* Solid medal disc with star */}
      <circle cx="12" cy="15" r="6" fill="currentColor" stroke="none" />
      <polygon
        points="12,11.8 13.1,14.2 15.6,14.5 13.7,16.3 14.2,18.8 12,17.5 9.8,18.8 10.3,16.3 8.4,14.5 10.9,14.2"
        fill="var(--surface, #14141a)"
        stroke="none"
      />
    </Icon>
  );
}

export function LightbulbIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"
        {...stroke}
      />
      <path d="M9 18h6" {...stroke} />
      <path d="M10 22h4" {...stroke} />
    </Icon>
  );
}
