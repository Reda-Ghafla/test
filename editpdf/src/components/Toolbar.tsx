import type { Tool } from '../lib/objects';
import { Icon, type IconName } from './icons';

const TOOLS: { tool: Tool; icon: IconName; label: string }[] = [
  { tool: 'select', icon: 'select', label: 'Select' },
  { tool: 'edittext', icon: 'editText', label: 'Edit text' },
  { tool: 'text', icon: 'text', label: 'Add text' },
  { tool: 'whiteout', icon: 'whiteout', label: 'White-out' },
  { tool: 'highlight', icon: 'highlight', label: 'Highlight' },
  { tool: 'draw', icon: 'draw', label: 'Draw' },
  { tool: 'rect', icon: 'rect', label: 'Rectangle' },
  { tool: 'line', icon: 'line', label: 'Line' },
  { tool: 'arrow', icon: 'arrow', label: 'Arrow' },
  { tool: 'image', icon: 'image', label: 'Image' },
  { tool: 'signature', icon: 'signature', label: 'Sign' },
  { tool: 'date', icon: 'date', label: 'Date' },
  { tool: 'check', icon: 'check', label: 'Check' },
];

interface Props {
  tool: Tool;
  onTool: (tool: Tool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClearPage: () => void;
  canClear: boolean;
  onFindReplace: () => void;
}

function ToolButton({
  icon,
  label,
  active,
  disabled,
  onClick,
  title,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-pressed={active}
      className={`flex min-w-14 shrink-0 flex-col items-center gap-0.5 rounded-lg px-1.5 py-1 text-[11px] font-medium transition
        disabled:cursor-not-allowed disabled:opacity-35
        ${active ? 'bg-brand-800 text-white shadow-sm' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'}`}
    >
      <Icon name={icon} />
      {label}
    </button>
  );
}

/** Editing tools. Sits under the top bar on desktop and at the bottom of the screen on phones. */
export function Toolbar({ tool, onTool, canUndo, canRedo, onUndo, onRedo, onClearPage, canClear, onFindReplace }: Props) {
  return (
    <div className="z-20 flex shrink-0 items-center gap-1 overflow-x-auto border-stone-200 bg-white px-2 py-1.5 [scrollbar-width:none] max-md:order-last max-md:border-t md:border-b md:justify-center">
      {TOOLS.map((t) => (
        <ToolButton key={t.tool} icon={t.icon} label={t.label} active={tool === t.tool} onClick={() => onTool(t.tool)} />
      ))}
      <span className="mx-1 h-8 w-px shrink-0 bg-stone-200" />
      <ToolButton icon="search" label="Replace" title="Find and replace text in the whole document" onClick={onFindReplace} />
      <span className="mx-1 h-8 w-px shrink-0 bg-stone-200" />
      <ToolButton icon="undo" label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo} />
      <ToolButton icon="redo" label="Redo" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={onRedo} />
      <ToolButton icon="clear" label="Clear page" title="Remove everything you added to this page" disabled={!canClear} onClick={onClearPage} />
    </div>
  );
}
