import { memo } from 'react';
import type { EditorDoc, PageRef } from '../lib/types';
import { useRenderPage } from '../lib/useRenderPage';
import { useInView } from '../lib/useInView';

const THUMB_WIDTH = 120;

interface ThumbProps {
  page: PageRef;
  doc: EditorDoc;
  index: number;
  active: boolean;
  onSelect: (index: number) => void;
}

const Thumb = memo(function Thumb({ page, doc, index, active, onSelect }: ThumbProps) {
  const source = doc.sources[page.sourceId];
  const { ref, inView } = useInView<HTMLButtonElement>('400px');
  // Render at a scale that makes the thumbnail ~THUMB_WIDTH px wide.
  const { canvasRef, width, height, ready } = useRenderPage(
    source.pdf,
    page.sourceIndex,
    0.2,
    page.rotation,
    inView,
  );
  const ratio = ready && width ? height / width : 1.294;

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onSelect(index)}
      aria-label={`Go to page ${index + 1}`}
      aria-current={active ? 'page' : undefined}
      className={`group flex w-full flex-col items-center gap-1.5 rounded-xl p-2 transition
        ${active ? 'bg-brand-100' : 'hover:bg-stone-200/70'}`}
    >
      <span
        className={`block overflow-hidden rounded bg-white shadow-sm ring-2 transition
          ${active ? 'ring-brand-600' : 'ring-transparent group-hover:ring-stone-300'}`}
        style={{ width: THUMB_WIDTH, height: THUMB_WIDTH * ratio }}
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
      </span>
      <span className={`text-xs font-medium ${active ? 'text-brand-800' : 'text-stone-500'}`}>{index + 1}</span>
    </button>
  );
});

interface Props {
  doc: EditorDoc;
  currentIndex: number;
  onSelect: (index: number) => void;
}

export function Thumbnails({ doc, currentIndex, onSelect }: Props) {
  return (
    <nav aria-label="Pages" className="flex flex-col gap-1 p-2">
      {doc.pages.map((p, i) => (
        <Thumb key={p.id} page={p} doc={doc} index={i} active={i === currentIndex} onSelect={onSelect} />
      ))}
    </nav>
  );
}
