import { useRef, useState, type ReactNode } from 'react';
import {
  fitText,
  lineGeometry,
  newId,
  strokePath,
  type EditObj,
  type LineObj,
  type Tool,
  type ToolOptions,
} from '../lib/objects';
import { ObjectView } from './ObjectView';

const DRAG_TOOLS: Tool[] = ['whiteout', 'highlight', 'rect', 'line', 'arrow', 'draw'];

interface Draft {
  tool: Tool;
  sx: number;
  sy: number;
  x: number;
  y: number;
  pts: number[];
}

export interface ObjectLayerProps {
  pageId: string;
  width: number;
  height: number;
  zoom: number;
  objects: EditObj[];
  tool: Tool;
  options: ToolOptions;
  selectedId: string | null;
  editingId: string | null;
  onCreate: (pageId: string, obj: EditObj, opts?: { edit?: boolean; keepTool?: boolean; select?: boolean }) => void;
  onChange: (pageId: string, obj: EditObj) => void;
  onDelete: (pageId: string, id: string) => void;
  onSelect: (pageId: string, id: string | null) => void;
  onEdit: (id: string | null) => void;
  children?: ReactNode;
}

export const today = () =>
  new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

/** Overlay on top of a page canvas: places new objects and hosts the existing ones. */
export function ObjectLayer(props: ObjectLayerProps) {
  const { pageId, width, height, zoom, objects, tool, options, selectedId, editingId } = props;
  const bgRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const toPage = (e: React.PointerEvent) => {
    const r = bgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button > 0) return;
    const { x, y } = toPage(e);
    if (tool === 'select') {
      props.onSelect(pageId, null);
      return;
    }
    // Stop the browser from moving focus (which would close a new text box) or selecting text.
    e.preventDefault();
    if (tool === 'text' || tool === 'date') {
      const o = fitText({
        id: newId(),
        type: 'text',
        text: tool === 'date' ? today() : 'Type here',
        font: options.font,
        size: options.size,
        color: options.textColor,
        bold: options.bold,
        x,
        y: y - options.size * 0.6,
        w: 0,
        h: 0,
        rot: 0,
      });
      props.onCreate(pageId, o, { edit: tool === 'text' });
      return;
    }
    if (tool === 'check') {
      const s = Math.max(14, options.size * 1.5);
      props.onCreate(pageId, { id: newId(), type: 'check', color: options.strokeColor, x: x - s / 2, y: y - s / 2, w: s, h: s, rot: 0 });
      return;
    }
    if (DRAG_TOOLS.includes(tool)) {
      bgRef.current!.setPointerCapture(e.pointerId);
      setDraft({ tool, sx: x, sy: y, x, y, pts: [x, y] });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draft) return;
    const { x, y } = toPage(e);
    setDraft((d) => d && { ...d, x, y, pts: d.tool === 'draw' ? [...d.pts, x, y] : d.pts });
  };

  const onPointerUp = () => {
    if (!draft) return;
    const o = finishDraft(draft, options);
    setDraft(null);
    if (o) props.onCreate(pageId, o, { keepTool: draft.tool === 'draw' || draft.tool === 'highlight', select: draft.tool !== 'draw' });
  };

  return (
    <div className="absolute inset-0" style={{ width: width * zoom, height: height * zoom }}>
      <div
        ref={bgRef}
        className="absolute inset-0"
        style={{
          touchAction: tool === 'select' ? 'pan-x pan-y pinch-zoom' : 'none',
          cursor: tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDraft(null)}
      />
      {props.children}
      {objects.map((o) => (
        <ObjectView
          key={o.id}
          obj={o}
          zoom={zoom}
          selected={o.id === selectedId}
          editing={o.id === editingId}
          interactive={tool === 'select'}
          onSelect={(id) => props.onSelect(pageId, id)}
          onChange={(obj) => props.onChange(pageId, obj)}
          onDelete={(id) => props.onDelete(pageId, id)}
          onEdit={props.onEdit}
        />
      ))}
      {draft && <DraftPreview draft={draft} options={options} zoom={zoom} />}
    </div>
  );
}

function finishDraft(d: Draft, opt: ToolOptions): EditObj | null {
  const id = newId();
  const base = { id, rot: 0 };
  if (d.tool === 'draw') {
    const pad = opt.strokeWidth;
    const xs = d.pts.filter((_, i) => i % 2 === 0);
    const ys = d.pts.filter((_, i) => i % 2 === 1);
    const x = Math.min(...xs) - pad;
    const y = Math.min(...ys) - pad;
    const w = Math.max(...xs) + pad - x;
    const h = Math.max(...ys) + pad - y;
    return {
      ...base,
      type: 'draw',
      color: opt.strokeColor,
      stroke: opt.strokeWidth,
      pts: d.pts.map((v, i) => (i % 2 ? v - y : v - x)),
      vw: w,
      vh: h,
      x,
      y,
      w,
      h,
    };
  }
  if (d.tool === 'line' || d.tool === 'arrow') {
    let { sx, sy, x: ex, y: ey } = d;
    if (Math.hypot(ex - sx, ey - sy) < 4) {
      ex = sx + 100;
      ey = sy;
    }
    const pad = Math.max(6, opt.strokeWidth * (d.tool === 'arrow' ? 3 : 1.5));
    const x = Math.min(sx, ex) - pad;
    const y = Math.min(sy, ey) - pad;
    const w = Math.abs(ex - sx) + pad * 2;
    const h = Math.abs(ey - sy) + pad * 2;
    return {
      ...base,
      type: d.tool,
      color: opt.strokeColor,
      stroke: opt.strokeWidth,
      x,
      y,
      w,
      h,
      x1: (sx - x) / w,
      y1: (sy - y) / h,
      x2: (ex - x) / w,
      y2: (ey - y) / h,
    };
  }
  let x = Math.min(d.sx, d.x);
  let y = Math.min(d.sy, d.y);
  let w = Math.abs(d.x - d.sx);
  let h = Math.abs(d.y - d.sy);
  if (w < 4 && h < 4) {
    // A plain click drops a default-sized box.
    const size = { whiteout: [140, 22], highlight: [140, 16], rect: [120, 80] }[d.tool as 'rect'];
    [w, h] = size;
    x = d.sx;
    y = d.sy - h / 2;
  }
  w = Math.max(w, 4);
  h = Math.max(h, 4);
  const type = d.tool as 'whiteout' | 'highlight' | 'rect';
  const color = type === 'highlight' ? opt.highlightColor : type === 'rect' ? opt.strokeColor : '#ffffff';
  return { ...base, type, color, stroke: opt.strokeWidth, x, y, w, h };
}

function DraftPreview({ draft: d, options: opt, zoom }: { draft: Draft; options: ToolOptions; zoom: number }) {
  const x = Math.min(d.sx, d.x);
  const y = Math.min(d.sy, d.y);
  const w = Math.abs(d.x - d.sx);
  const h = Math.abs(d.y - d.sy);
  let content: ReactNode = null;
  if (d.tool === 'draw') {
    content = <path d={strokePath(d.pts)} stroke={opt.strokeColor} strokeWidth={opt.strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
  } else if (d.tool === 'line' || d.tool === 'arrow') {
    const fake: LineObj = { id: '', type: d.tool, color: opt.strokeColor, stroke: opt.strokeWidth, x: 0, y: 0, w: 1, h: 1, rot: 0, x1: d.sx, y1: d.sy, x2: d.x, y2: d.y };
    const g = lineGeometry(fake, 1, 1);
    content = (
      <>
        <path d={g.shaft} stroke={opt.strokeColor} strokeWidth={opt.strokeWidth} strokeLinecap="round" />
        {g.head && <path d={g.head} fill={opt.strokeColor} />}
      </>
    );
  } else if (d.tool === 'rect') {
    content = <rect x={x} y={y} width={w} height={h} fill="none" stroke={opt.strokeColor} strokeWidth={opt.strokeWidth} />;
  } else if (d.tool === 'highlight') {
    content = <rect x={x} y={y} width={w} height={h} fill={opt.highlightColor} opacity={0.4} />;
  } else if (d.tool === 'whiteout') {
    content = <rect x={x} y={y} width={w} height={h} fill="#fff" stroke="#a8a29e" strokeDasharray="4 3" strokeWidth={1 / zoom} />;
  }
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
      <g transform={`scale(${zoom})`}>{content}</g>
    </svg>
  );
}
