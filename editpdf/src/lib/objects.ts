import { uid } from './id';

/**
 * Editable objects. Coordinates are in the page's *display space at zoom 1*:
 * PDF points, origin at the top-left of the page as currently shown
 * (including page rotation), y pointing down. `rot` is the object's own
 * clockwise rotation, which only changes when the page is rotated after the
 * object was placed, so objects turn together with the page.
 */
export type FontFamily = 'Helvetica' | 'Times' | 'Courier';

interface Base {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
}

export interface TextObj extends Base {
  type: 'text';
  text: string;
  font: FontFamily;
  size: number;
  color: string;
  bold: boolean;
}
export interface BoxObj extends Base {
  type: 'whiteout' | 'highlight' | 'rect';
  color: string;
  stroke: number;
}
export interface LineObj extends Base {
  type: 'line' | 'arrow';
  color: string;
  stroke: number;
  /** Endpoints as fractions (0..1) of the object's content box. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface DrawObj extends Base {
  type: 'draw';
  color: string;
  stroke: number;
  /** Flat [x0,y0,x1,y1,...] list in a vw × vh coordinate box, scaled to the object box. */
  pts: number[];
  vw: number;
  vh: number;
}
export interface ImageObj extends Base {
  type: 'image';
  src: string;
}
export interface CheckObj extends Base {
  type: 'check';
  color: string;
}

export type EditObj = TextObj | BoxObj | LineObj | DrawObj | ImageObj | CheckObj;
export type ObjType = EditObj['type'];

export type Tool =
  | 'select'
  | 'text'
  | 'whiteout'
  | 'highlight'
  | 'draw'
  | 'rect'
  | 'line'
  | 'arrow'
  | 'image'
  | 'signature'
  | 'date'
  | 'check';

export interface ToolOptions {
  font: FontFamily;
  size: number;
  textColor: string;
  bold: boolean;
  strokeColor: string;
  strokeWidth: number;
  highlightColor: string;
}

export const DEFAULT_OPTIONS: ToolOptions = {
  font: 'Helvetica',
  size: 14,
  textColor: '#111827',
  bold: false,
  strokeColor: '#1d4ed8',
  strokeWidth: 2,
  highlightColor: '#fde047',
};

/** Size of the object's content before its own rotation is applied. */
export const contentSize = (o: Base) => (o.rot % 180 === 0 ? { cw: o.w, ch: o.h } : { cw: o.h, ch: o.w });

export const newId = () => uid('obj');

export const FONT_CSS: Record<FontFamily, string> = {
  Helvetica: 'Helvetica, Arial, "Liberation Sans", sans-serif',
  Times: '"Times New Roman", Times, "Liberation Serif", serif',
  Courier: '"Courier New", Courier, "Liberation Mono", monospace',
};

/** Ascent/descent (as a fraction of font size) of the CSS fonts above, used to line up baselines on export. */
export const FONT_METRICS: Record<FontFamily, { asc: number; desc: number }> = {
  Helvetica: { asc: 0.905, desc: 0.212 },
  Times: { asc: 0.891, desc: 0.216 },
  Courier: { asc: 0.833, desc: 0.3 },
};

export const LINE_HEIGHT = 1.2;

let measureCtx: CanvasRenderingContext2D | null = null;

/** Measure a (multi-line) text block in points, the same way it is laid out on screen. */
export function measureText(text: string, font: FontFamily, size: number, bold: boolean) {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  const lines = text.split('\n');
  let w = 0;
  if (measureCtx) {
    measureCtx.font = `${bold ? 'bold ' : ''}${size}px ${FONT_CSS[font]}`;
    for (const line of lines) w = Math.max(w, measureCtx.measureText(line).width);
  }
  return { w: Math.max(Math.ceil(w) + 2, size * 0.6), h: lines.length * size * LINE_HEIGHT };
}

/** Recompute a text object's box after its text or font changed (keeps the top-left corner). */
export function fitText(o: TextObj): TextObj {
  const { w, h } = measureText(o.text || ' ', o.font, o.size, o.bold);
  return o.rot % 180 === 0 ? { ...o, w, h } : { ...o, w: h, h: w };
}

/** The smoothed SVG path used for freehand strokes, both on screen and in the PDF. */
export function strokePath(pts: number[], sx = 1, sy = 1) {
  const n = pts.length / 2;
  if (n === 0) return '';
  const p = (i: number) => [pts[i * 2] * sx, pts[i * 2 + 1] * sy] as const;
  const [x0, y0] = p(0);
  if (n === 1) return `M ${x0} ${y0} L ${x0 + 0.01} ${y0}`;
  let d = `M ${x0} ${y0}`;
  for (let i = 1; i < n - 1; i++) {
    const [x, y] = p(i);
    const [nx, ny] = p(i + 1);
    d += ` Q ${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`;
  }
  const [lx, ly] = p(n - 1);
  return `${d} L ${lx} ${ly}`;
}

/** Geometry for a line/arrow inside a cw × ch box: the shaft and (for arrows) the head triangle. */
export function lineGeometry(o: LineObj, cw: number, ch: number) {
  const x1 = o.x1 * cw;
  const y1 = o.y1 * ch;
  const x2 = o.x2 * cw;
  const y2 = o.y2 * ch;
  if (o.type !== 'arrow') return { shaft: `M ${x1} ${y1} L ${x2} ${y2}`, head: null };
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const headLen = Math.min(Math.max(10, o.stroke * 4), len * 0.6);
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const bx = x2 - ux * headLen;
  const by = y2 - uy * headLen;
  const half = headLen * 0.5;
  const head = `M ${x2} ${y2} L ${bx - uy * half} ${by + ux * half} L ${bx + uy * half} ${by - ux * half} Z`;
  return { shaft: `M ${x1} ${y1} L ${bx} ${by}`, head };
}

/** Checkmark polyline in a 24 × 24 box. */
export const CHECK_POINTS = [4, 12.5, 9.5, 18, 20, 6];
