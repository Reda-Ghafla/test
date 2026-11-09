import type { ReactNode } from 'react';

const paths: Record<string, ReactNode> = {
  select: <path d="M5 3l14 8-6 1.5L9.5 19z" />,
  text: (
    <>
      <path d="M5 6V4h14v2" />
      <path d="M12 4v16" />
      <path d="M9 20h6" />
    </>
  ),
  editText: (
    <>
      <path d="M4 7V5h10v2" />
      <path d="M9 5v13" />
      <path d="M7 18h4" />
      <path d="M17 9v10M15 9h4M15 19h4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.5-4.5" />
    </>
  ),
  whiteout: (
    <>
      <rect x="3" y="7" width="18" height="10" rx="1.5" />
      <path d="M7 12h10" strokeDasharray="2 2" />
    </>
  ),
  highlight: (
    <>
      <path d="m9 11 6-6 4 4-6 6" />
      <path d="M9 11l-3 3v3h3l3-3" />
      <path d="M3 21h18" />
    </>
  ),
  draw: <path d="M3 17c3-6 5-9 7-9s1 5 3 5 3-6 5-6 2 3 3 4" />,
  rect: <rect x="4" y="5" width="16" height="14" rx="1.5" />,
  line: <path d="M5 19 19 5" />,
  arrow: (
    <>
      <path d="M5 19 19 5" />
      <path d="M10 5h9v9" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m21 16-5-5L5 20" />
    </>
  ),
  signature: (
    <>
      <path d="M3 17c2-1 3-6 5-6s0 6 2 6 3-4 4-4 1 3 3 3" />
      <path d="M3 21h18" />
    </>
  ),
  date: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  check: <path d="M4 12.5 9.5 18 20 6" />,
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </>
  ),
  redo: (
    <>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0 0 12h3" />
    </>
  ),
  clear: (
    <>
      <path d="M4 20h16" />
      <path d="m6 16 9-9 4 4-6 6H8z" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M9 7V4h6v3" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
    </>
  ),
  rotateCw: (
    <>
      <path d="M20 4v6h-6" />
      <path d="M20 10a8 8 0 1 0 1 6" />
    </>
  ),
  rotateCcw: (
    <>
      <path d="M4 4v6h6" />
      <path d="M4 10a8 8 0 1 1-1 6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  sidebar: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 20h14" />
    </>
  ),
  grip: (
    <>
      <circle cx="9" cy="6" r="1" />
      <circle cx="15" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="18" r="1" />
    </>
  ),
  filePlus: (
    <>
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
      <path d="M14 3v5h5M12 11v6M9 14h6" />
    </>
  ),
  merge: (
    <>
      <rect x="3" y="3" width="11" height="14" rx="1" />
      <rect x="10" y="7" width="11" height="14" rx="1" />
    </>
  ),
};

export type IconName = keyof typeof paths;

export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
