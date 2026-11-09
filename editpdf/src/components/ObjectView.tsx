import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FONT_CSS, LINE_HEIGHT, contentSize, fitText, measureText, type EditObj, type TextObj } from '../lib/objects';
import { ObjectContent } from './ObjectContent';
import { Icon } from './icons';

type Box = { x: number; y: number; w: number; h: number };
type Handle = { hx: -1 | 0 | 1; hy: -1 | 0 | 1; cursor: string };

const CORNERS: Handle[] = [
  { hx: -1, hy: -1, cursor: 'nwse-resize' },
  { hx: 1, hy: -1, cursor: 'nesw-resize' },
  { hx: -1, hy: 1, cursor: 'nesw-resize' },
  { hx: 1, hy: 1, cursor: 'nwse-resize' },
];
const EDGES: Handle[] = [
  { hx: 0, hy: -1, cursor: 'ns-resize' },
  { hx: 0, hy: 1, cursor: 'ns-resize' },
  { hx: -1, hy: 0, cursor: 'ew-resize' },
  { hx: 1, hy: 0, cursor: 'ew-resize' },
];
const MIN = 6;

const keepsAspect = (o: EditObj) => o.type === 'image' || o.type === 'check' || o.type === 'text';

interface Props {
  obj: EditObj;
  zoom: number;
  selected: boolean;
  editing: boolean;
  interactive: boolean;
  onSelect: (id: string) => void;
  onChange: (obj: EditObj) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string | null) => void;
}

export const ObjectView = memo(function ObjectView({
  obj,
  zoom,
  selected,
  editing,
  interactive,
  onSelect,
  onChange,
  onDelete,
  onEdit,
}: Props) {
  const [draft, setDraft] = useState<Box | null>(null);
  const gesture = useRef<{ kind: 'move' | Handle; sx: number; sy: number; box: Box; moved: boolean; wasSelected: boolean } | null>(null);

  const box: Box = draft ?? obj;
  const shown: EditObj = draft ? resized(obj, draft) : obj;
  const { cw, ch } = contentSize(shown);

  const begin = (e: React.PointerEvent, kind: 'move' | Handle) => {
    if (!interactive || e.button > 0) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    gesture.current = { kind, sx: e.clientX, sy: e.clientY, box: { x: obj.x, y: obj.y, w: obj.w, h: obj.h }, moved: false, wasSelected: selected };
    onSelect(obj.id);
  };

  const move = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = (e.clientX - g.sx) / zoom;
    const dy = (e.clientY - g.sy) / zoom;
    if (!g.moved && Math.hypot(dx, dy) * zoom < 3) return;
    g.moved = true;
    if (g.kind === 'move') {
      setDraft({ ...g.box, x: g.box.x + dx, y: g.box.y + dy });
      return;
    }
    const { hx, hy } = g.kind;
    const b = g.box;
    let w = Math.max(MIN, b.w + hx * dx);
    let h = Math.max(MIN, b.h + hy * dy);
    if (keepsAspect(obj) && hx !== 0 && hy !== 0) {
      const s = Math.max(w / b.w, h / b.h);
      w = Math.max(MIN, b.w * s);
      h = Math.max(MIN, b.h * s);
    }
    setDraft({ w, h, x: hx < 0 ? b.x + b.w - w : b.x, y: hy < 0 ? b.y + b.h - h : b.y });
  };

  const end = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.moved && draft) onChange(resized(obj, draft));
    else if (!g.moved && g.wasSelected && obj.type === 'text' && g.kind === 'move') onEdit(obj.id);
    setDraft(null);
  };

  const handles = obj.type === 'text' || obj.type === 'image' || obj.type === 'check' ? CORNERS : [...CORNERS, ...EDGES];

  return (
    <div
      className="absolute"
      style={{
        left: box.x * zoom,
        top: box.y * zoom,
        width: box.w * zoom,
        height: box.h * zoom,
        cursor: interactive ? 'move' : undefined,
        touchAction: interactive ? 'none' : undefined,
        pointerEvents: interactive ? 'auto' : 'none',
        zIndex: selected ? 2 : 1,
      }}
      onPointerDown={(e) => begin(e, 'move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => obj.type === 'text' && onEdit(obj.id)}
      data-object-id={obj.id}
      data-object-type={obj.type}
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{ width: cw * zoom, height: ch * zoom, transform: `translate(-50%, -50%) rotate(${shown.rot}deg)` }}
      >
        {editing && obj.type === 'text' ? (
          <TextEditor obj={obj} zoom={zoom} onDone={(o) => (o.text.trim() ? onChange(o) : onDelete(o.id), onEdit(null))} />
        ) : (
          <ObjectContent o={shown} cw={cw} ch={ch} zoom={zoom} />
        )}
      </div>

      {selected && interactive && !editing && (
        <>
          <div className="pointer-events-none absolute -inset-px rounded-sm outline-2 outline-offset-2 outline-brand-500 outline-dashed" />
          {handles.map((hd) => (
            <span
              key={`${hd.hx}${hd.hy}`}
              onPointerDown={(e) => begin(e, hd)}
              className="absolute z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brand-600 bg-white shadow"
              style={{ left: `${(hd.hx + 1) * 50}%`, top: `${(hd.hy + 1) * 50}%`, cursor: hd.cursor, touchAction: 'none' }}
            />
          ))}
          <div
            className="absolute -top-11 left-1/2 z-20 flex -translate-x-1/2 gap-1 rounded-lg bg-stone-900 p-1 text-white shadow-lg"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {obj.type === 'text' && (
              <button type="button" aria-label="Edit text" title="Edit text" onClick={() => onEdit(obj.id)} className="rounded-md p-1.5 hover:bg-white/15">
                <Icon name="edit" className="h-4 w-4" />
              </button>
            )}
            <button type="button" aria-label="Delete" title="Delete (Del)" onClick={() => onDelete(obj.id)} className="rounded-md p-1.5 hover:bg-red-500">
              <Icon name="trash" className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
});

/** Apply a new box to an object. Text scales its font size; everything else stretches. */
function resized(o: EditObj, b: Box): EditObj {
  if (o.type === 'text' && (b.w !== o.w || b.h !== o.h)) {
    const size = Math.max(4, Math.round(o.size * (b.h / o.h) * 10) / 10);
    const fitted = fitText({ ...o, size });
    // Keep the corner opposite to the dragged one in place.
    return {
      ...fitted,
      x: b.x === o.x ? o.x : o.x + o.w - fitted.w,
      y: b.y === o.y ? o.y : o.y + o.h - fitted.h,
    };
  }
  return { ...o, ...b };
}

function TextEditor({ obj, zoom, onDone }: { obj: TextObj; zoom: number; onDone: (o: TextObj) => void }) {
  const [text, setText] = useState(obj.text);
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const focus = () => {
    if (document.activeElement === ref.current) return;
    ref.current?.focus();
    ref.current?.select();
  };
  useLayoutEffect(focus, []);
  useEffect(() => {
    // Again after the pointer event that created the box has finished, in case it moved focus.
    const t = window.setTimeout(focus, 0);
    return () => window.clearTimeout(t);
  }, []);
  const { w, h } = measureText(text || ' ', obj.font, obj.size, obj.bold);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone(fitText({ ...obj, text: text.replace(/\s+$/, '') }));
  };
  return (
    <textarea
      ref={ref}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={finish}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) finish();
      }}
      spellCheck={false}
      wrap="off"
      className="block resize-none overflow-hidden border-0 bg-brand-50/60 p-0 outline-2 outline-brand-500"
      style={{
        width: (w + obj.size) * zoom,
        height: h * zoom,
        fontFamily: FONT_CSS[obj.font],
        fontSize: obj.size * zoom,
        lineHeight: LINE_HEIGHT,
        fontWeight: obj.bold ? 700 : 400,
        color: obj.color,
      }}
    />
  );
}
