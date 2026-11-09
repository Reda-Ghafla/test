import { Logo } from './Logo';
import { Icon, type IconName } from './icons';

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
  onDownload: () => void;
  downloading: boolean;
  onClose: () => void;
}

export function IconButton({
  icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
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
      <Icon name={icon} />
    </button>
  );
}

export function TopBar(props: Props) {
  const { fileName, pageCount, currentPage, zoom } = props;
  return (
    <header className="z-30 flex h-14 shrink-0 items-center gap-1 border-b border-stone-200 bg-white px-2 sm:gap-2 sm:px-3">
      <IconButton icon="sidebar" label="Toggle pages panel" onClick={props.onToggleThumbs} active={props.thumbsOpen} />

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
        <IconButton icon="minus" label="Zoom out" onClick={props.onZoomOut} disabled={zoom <= ZOOM_MIN} />
        <button
          type="button"
          onClick={props.onFitWidth}
          title="Fit to width"
          className="hidden w-12 text-center text-sm font-medium tabular-nums text-stone-700 hover:text-brand-700 sm:block"
        >
          {Math.round(zoom * 100)}%
        </button>
        <IconButton icon="plus" label="Zoom in" onClick={props.onZoomIn} disabled={zoom >= ZOOM_MAX} />
      </div>

      <button
        type="button"
        onClick={props.onDownload}
        disabled={props.downloading}
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent-500 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-600 disabled:cursor-wait disabled:opacity-70"
      >
        <Icon name="download" />
        <span className="hidden sm:inline">{props.downloading ? 'Saving…' : 'Download PDF'}</span>
      </button>

      <IconButton icon="close" label="Close document" onClick={props.onClose} />
    </header>
  );
}
