import { memo, useRef, useState } from 'react';
import { displaySize, type PageRef, type SourceDoc } from '../lib/types';
import { useRenderPage } from '../lib/useRenderPage';
import { useInView } from '../lib/useInView';
import { Icon, type IconName } from './icons';

const THUMB_WIDTH = 112;

interface ThumbProps {
  page: PageRef;
  source: SourceDoc;
  index: number;
  active: boolean;
  dragging: boolean;
  canDelete: boolean;
  onSelect: (index: number) => void;
  onRotate: (index: number, delta: number) => void;
  onDelete: (index: number) => void;
  onGrab: (index: number, e: React.PointerEvent) => void;
}

function SmallButton({ icon, label, onClick, danger }: { icon: IconName; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`rounded-md bg-white/95 p-1 text-stone-700 shadow ring-1 ring-stone-200 ${danger ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-brand-50 hover:text-brand-700'}`}
    >
      <Icon name={icon} className="h-4 w-4" />
    </button>
  );
}

const Thumb = memo(function Thumb(p: ThumbProps) {
  const { page, source, index, active } = p;
  const { ref, inView } = useInView<HTMLDivElement>('400px');
  const { w, h } = displaySize(page);
  const scale = THUMB_WIDTH / Math.max(w, h * 0.77);
  const { canvasRef } = useRenderPage(source.pdf, page.sourceIndex, scale, page.rotation, inView);

  return (
    <div
      ref={ref}
      data-thumb-index={index}
      className={`group relative flex w-full flex-col items-center gap-1.5 rounded-xl p-2 transition
        ${active ? 'bg-brand-100' : 'hover:bg-stone-200/70'} ${p.dragging ? 'opacity-40' : ''}`}
    >
      <button
        type="button"
        onClick={() => p.onSelect(index)}
        aria-label={`Go to page ${index + 1}`}
        aria-current={active ? 'page' : undefined}
        className={`block overflow-hidden rounded bg-white shadow-sm ring-2 transition
          ${active ? 'ring-brand-600' : 'ring-transparent group-hover:ring-stone-300'}`}
        style={{ width: w * scale, height: h * scale }}
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
      </button>
      <div className="flex w-full items-center justify-between px-1">
        <span
          onPointerDown={(e) => p.onGrab(index, e)}
          title="Drag to reorder"
          aria-label={`Drag page ${index + 1} to reorder`}
          className="cursor-grab touch-none rounded p-0.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700 active:cursor-grabbing"
        >
          <Icon name="grip" className="h-4 w-4" />
        </span>
        <span className={`text-xs font-medium ${active ? 'text-brand-800' : 'text-stone-500'}`}>{index + 1}</span>
        <span className="w-5" />
      </div>
      <div className="absolute right-3 top-3 flex flex-col gap-1 opacity-100 transition md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        <SmallButton icon="rotateCw" label={`Rotate page ${index + 1} right`} onClick={() => p.onRotate(index, 90)} />
        <SmallButton icon="rotateCcw" label={`Rotate page ${index + 1} left`} onClick={() => p.onRotate(index, -90)} />
        {p.canDelete && <SmallButton icon="trash" label={`Delete page ${index + 1}`} danger onClick={() => p.onDelete(index)} />}
      </div>
    </div>
  );
});

interface Props {
  pages: PageRef[];
  sources: Record<string, SourceDoc>;
  currentIndex: number;
  onSelect: (index: number) => void;
  onRotate: (index: number, delta: number) => void;
  onDelete: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onAddBlank: () => void;
  onMerge: () => void;
}

export function Thumbnails({ pages, sources, currentIndex, onSelect, onRotate, onDelete, onMove, onAddBlank, onMerge }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);

  /** Insertion index (0..n) for a pointer y position. */
  const targetFor = (clientY: number) => {
    const items = listRef.current?.querySelectorAll<HTMLElement>('[data-thumb-index]') ?? [];
    let to = items.length;
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) {
        to = i;
        break;
      }
    }
    return to;
  };

  const onGrab = (index: number, e: React.PointerEvent) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    setDrag({ from: index, to: index });
    const scroller = listRef.current?.parentElement;
    const onMoveEv = (ev: PointerEvent) => {
      setDrag({ from: index, to: targetFor(ev.clientY) });
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        if (ev.clientY < r.top + 40) scroller.scrollBy(0, -12);
        else if (ev.clientY > r.bottom - 40) scroller.scrollBy(0, 12);
      }
    };
    const onUp = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', onMoveEv);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      const to = targetFor(ev.clientY);
      setDrag(null);
      // `to` is an insertion index in the original list; convert to the final index.
      const final = to > index ? to - 1 : to;
      if (ev.type === 'pointerup' && final !== index) onMove(index, final);
    };
    el.addEventListener('pointermove', onMoveEv);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  };

  return (
    <nav aria-label="Pages" className="flex flex-col gap-2 p-2">
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={onAddBlank}
          title="Insert a blank page after the current page"
          className="flex flex-col items-center gap-0.5 rounded-lg bg-white px-1 py-1.5 text-[11px] font-medium text-stone-700 ring-1 ring-stone-200 hover:bg-brand-50 hover:text-brand-800"
        >
          <Icon name="filePlus" className="h-4 w-4" />
          Blank page
        </button>
        <button
          type="button"
          onClick={onMerge}
          title="Add the pages of another PDF at the end"
          className="flex flex-col items-center gap-0.5 rounded-lg bg-white px-1 py-1.5 text-[11px] font-medium text-stone-700 ring-1 ring-stone-200 hover:bg-brand-50 hover:text-brand-800"
        >
          <Icon name="merge" className="h-4 w-4" />
          Merge PDF
        </button>
      </div>
      <div ref={listRef} className="flex flex-col gap-1">
        {pages.map((p, i) => (
          <div key={p.id} className="relative">
            {drag && drag.to === i && drag.to !== drag.from && drag.to !== drag.from + 1 && (
              <div className="absolute -top-1 left-2 right-2 h-1 rounded-full bg-accent-500" />
            )}
            <Thumb
              page={p}
              source={sources[p.sourceId]}
              index={i}
              active={i === currentIndex}
              dragging={drag?.from === i}
              canDelete={pages.length > 1}
              onSelect={onSelect}
              onRotate={onRotate}
              onDelete={onDelete}
              onGrab={onGrab}
            />
          </div>
        ))}
        {drag && drag.to === pages.length && drag.from !== pages.length - 1 && (
          <div className="mx-2 h-1 rounded-full bg-accent-500" />
        )}
      </div>
    </nav>
  );
}
