/**
 * Inline SVGs. The app is served outside the platform shell, so it can never
 * assume the icomoon font or any theme stylesheet is present.
 */
interface SizeProps {
  size?: number;
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function CloseIcon({ size = 14 }: SizeProps) {
  return (
    <svg viewBox="0 0 14 14" width={size} height={size} aria-hidden="true">
      <path d="M3 3l8 8M11 3L3 11" {...stroke} />
    </svg>
  );
}

export function ChevronIcon({ open, size = 12 }: SizeProps & { open?: boolean }) {
  return (
    <svg viewBox="0 0 12 12" width={size} height={size} aria-hidden="true">
      <path d={open ? 'M2.5 4.5 L6 8 L9.5 4.5' : 'M4.5 2.5 L8 6 L4.5 9.5'} {...stroke} strokeWidth={1.6} />
    </svg>
  );
}

export function CaretIcon({ dir = 'left', size = 10 }: SizeProps & { dir?: 'left' | 'right' }) {
  const d = dir === 'right' ? 'M3.5 1.5 L8.5 5.5 L3.5 9.5' : 'M8.5 1.5 L3.5 5.5 L8.5 9.5';
  return (
    <svg viewBox="0 0 12 11" width={size} height={size} aria-hidden="true">
      <path d={d} fill="currentColor" />
    </svg>
  );
}

export function RefreshIcon({ size = 14 }: SizeProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.1A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
      />
    </svg>
  );
}

export function BlocksIcon({ size = 14 }: SizeProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" />
    </svg>
  );
}

export function MaximizeIcon({ size = 12 }: SizeProps) {
  return (
    <svg viewBox="0 0 14 14" width={size} height={size} aria-hidden="true">
      <rect x="2" y="2" width="10" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function RestoreIcon({ size = 12 }: SizeProps) {
  return (
    <svg viewBox="0 0 14 14" width={size} height={size} aria-hidden="true">
      <rect x="4" y="2" width="8" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2" y="4" width="8" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function CogIcon({ size = 14 }: SizeProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M19.4 13a7.8 7.8 0 0 0 0-2l2.1-1.6a.5.5 0 0 0 .1-.6l-2-3.5a.5.5 0 0 0-.6-.2l-2.5 1a7.6 7.6 0 0 0-1.7-1l-.4-2.6a.5.5 0 0 0-.5-.4h-4a.5.5 0 0 0-.5.4l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.5-1a.5.5 0 0 0-.6.2l-2 3.5a.5.5 0 0 0 .1.6L4.6 11a7.8 7.8 0 0 0 0 2l-2.1 1.6a.5.5 0 0 0-.1.6l2 3.5a.5.5 0 0 0 .6.2l2.5-1a7.6 7.6 0 0 0 1.7 1l.4 2.6a.5.5 0 0 0 .5.4h4a.5.5 0 0 0 .5-.4l.4-2.6a7.6 7.6 0 0 0 1.7-1l2.5 1a.5.5 0 0 0 .6-.2l2-3.5a.5.5 0 0 0-.1-.6L19.4 13zM12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5z"
      />
    </svg>
  );
}

export function PlayIcon({ size = 13 }: SizeProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M8 5v14l11-7z" />
    </svg>
  );
}

export function CheckIcon({ size = 14 }: SizeProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M4 12.5 L9.5 18 L20 6.5" {...stroke} strokeWidth={2.2} />
    </svg>
  );
}

export function LayoutIcon({ size = 14 }: SizeProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M4 6h6M4 12h16M4 18h9" {...stroke} strokeWidth={2} />
    </svg>
  );
}

export function FitIcon({ size = 14 }: SizeProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" {...stroke} strokeWidth={2} />
    </svg>
  );
}

export function PencilIcon({ size = 14 }: SizeProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.04a1 1 0 0 0 0-1.41l-2.51-2.51a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.99-1.66z"
      />
    </svg>
  );
}

export function PlusIcon({ size = 14 }: SizeProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6v-2z" />
    </svg>
  );
}

export function CopyIcon({ size = 14 }: SizeProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
      />
    </svg>
  );
}

export function ExternalIcon({ size = 14 }: SizeProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"
      />
    </svg>
  );
}

export function TrashIcon({ size = 14 }: SizeProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
      />
    </svg>
  );
}

export function WarningIcon({ size = 16 }: SizeProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  );
}

/** Two-letter fallback when a block has no icon (or the icon 404s). */
export function initials(label?: string, fallback = '?'): string {
  const src = String(label || fallback || '?').trim();
  const parts = src.split(/[\s_/.-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

/** Trigger marker, as n8n places beside the left edge of a trigger node. */
export function BoltIcon({ size = 13 }: SizeProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z" />
    </svg>
  );
}

export function SearchIcon({ size = 14 }: SizeProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}
