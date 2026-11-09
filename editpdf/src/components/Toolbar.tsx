import type { ReactNode } from 'react';
import { Logo } from './Logo';

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;

interface Props {
  fileName: string;
  pageCount: number;
  currentPage: number;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  onToggleThumbs: () => void;
  thumbsOpen: boolean;
  onClose: () => void;
}

function IconButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-stone-700 transition
        hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40
        ${active ? 'bg-brand-100 text-brand-800' : ''}`}
    >
      {children}
    </button>
  );
}

const svg = {
  className: 'h-5 w-5',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function Toolbar(props: Props) {
  const { fileName, pageCount, currentPage, zoom } = props;
  return (
    <header className="z-20 flex h-14 shrink-0 items-center gap-1 border-b border-stone-200 bg-white px-2 sm:gap-2 sm:px-3">
      <IconButton label="Toggle page thumbnails" onClick={props.onToggleThumbs} active={props.thumbsOpen}>
        <svg {...svg}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M9 4v16" />
        </svg>
      </IconButton>

      <span className="hidden md:block">
        <Logo className="text-lg text-brand-900" />
      </span>

      <div className="ml-1 min-w-0 flex-1 sm:ml-3">
        <p className="truncate text-sm font-medium text-stone-800" title={fileName}>
          {fileName}
        </p>
        <p className="truncate text-xs text-stone-500">
          Page {currentPage} of {pageCount}
        </p>
      </div>

      <div className="flex items-center rounded-xl bg-stone-50 ring-1 ring-stone-200">
        <IconButton label="Zoom out" onClick={props.onZoomOut} disabled={zoom <= ZOOM_MIN}>
          <svg {...svg}>
            <path d="M5 12h14" />
          </svg>
        </IconButton>
        <button
          type="button"
          onClick={props.onFitWidth}
          title="Fit to width"
          className="w-14 text-center text-sm font-medium tabular-nums text-stone-700 hover:text-brand-700"
        >
          {Math.round(zoom * 100)}%
        </button>
        <IconButton label="Zoom in" onClick={props.onZoomIn} disabled={zoom >= ZOOM_MAX}>
          <svg {...svg}>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </IconButton>
      </div>

      <IconButton label="Close document" onClick={props.onClose}>
        <svg {...svg}>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </IconButton>
    </header>
  );
}
