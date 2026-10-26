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
      <path d="M13 3 5 13h6l-1 8 8-10h-6Z" {...stroke} />
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
      <path d="m5 12.5 4.5 4.5L19 7" {...stroke} />
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

export function HelpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" {...stroke} />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" {...stroke} />
      <path d="M12 17h.01" {...stroke} />
    </Icon>
  );
}
