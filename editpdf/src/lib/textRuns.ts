import { AnnotationMode, Util } from 'pdfjs-dist';
import type { PDFDocumentProxy } from './pdfjs';
import type { FontFamily } from './objects';
import { totalRotation, type PageRef } from './types';

/** A line of existing text on a page, in display space at zoom 1. */
export interface TextRun {
  id: string;
  text: string;
  /** Glyph box (top-left, width, height). */
  x: number;
  y: number;
  w: number;
  h: number;
  baseline: number;
  size: number;
  font: FontFamily;
  bold: boolean;
  italic: boolean;
  color: string;
  /** Colour behind the text, used to cover the original. */
  bg: string;
}

interface RawItem {
  str: string;
  x: number;
  baseline: number;
  w: number;
  size: number;
  asc: number;
  desc: number;
  fontName: string;
  family: string;
}

const SAMPLE_SCALE = 2;
const cache = new Map<string, Promise<TextRun[]>>();

/** Text runs for a page, cached per source page and rotation. */
export function getTextRuns(pdf: PDFDocumentProxy, page: PageRef): Promise<TextRun[]> {
  const key = `${page.sourceId}:${page.sourceIndex}:${totalRotation(page)}`;
  if (!cache.has(key)) {
    const p = extract(pdf, page).catch((err) => {
      cache.delete(key);
      throw err;
    });
    cache.set(key, p);
  }
  return cache.get(key)!;
}

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

async function extract(pdf: PDFDocumentProxy, ref: PageRef): Promise<TextRun[]> {
  const page = await pdf.getPage(ref.sourceIndex + 1);
  const rotation = totalRotation(ref);
  const viewport = page.getViewport({ scale: 1, rotation });
  const content = await page.getTextContent();

  const items: RawItem[] = [];
  for (const it of content.items) {
    if (!('str' in it) || !it.str) continue;
    const tx = Util.transform(viewport.transform, it.transform);
    const size = Math.hypot(tx[2], tx[3]);
    // Only text that reads left-to-right horizontally on screen can be edited in place.
    if (size < 1 || Math.abs(tx[1]) > size * 0.05 || tx[0] <= 0) continue;
    const style = content.styles[it.fontName] ?? { ascent: 0.8, descent: -0.2, fontFamily: 'sans-serif' };
    items.push({
      str: it.str,
      x: tx[4],
      baseline: tx[5],
      w: it.width * (Math.hypot(tx[0], tx[1]) / Math.hypot(it.transform[0], it.transform[1]) || 1),
      size,
      asc: style.ascent || 0.8,
      desc: style.descent || -0.2,
      fontName: it.fontName,
      family: style.fontFamily ?? '',
    });
  }

  // Group items into lines: same baseline and size, close together horizontally.
  items.sort((a, b) => a.baseline - b.baseline || a.x - b.x);
  const groups: RawItem[][] = [];
  for (const it of items) {
    const g = groups.find((grp) => {
      const last = grp[grp.length - 1];
      const gap = it.x - (last.x + last.w);
      return (
        // A change of font (e.g. a bold word) starts a new run, so each keeps its own style.
        last.fontName === it.fontName &&
        Math.abs(last.baseline - it.baseline) < last.size * 0.25 &&
        Math.abs(last.size - it.size) < last.size * 0.2 &&
        gap > -last.size * 0.3 &&
        gap < last.size * 0.9
      );
    });
    if (g) g.push(it);
    else groups.push([it]);
  }

  // Render the page once off-screen to read text and background colours.
  const sv = page.getViewport({ scale: SAMPLE_SCALE, rotation });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(sv.width);
  canvas.height = Math.ceil(sv.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  await page.render({ canvas: null, canvasContext: ctx, viewport: sv, annotationMode: AnnotationMode.ENABLE_FORMS }).promise;

  const runs: TextRun[] = [];
  groups.forEach((g, i) => {
    g.sort((a, b) => a.x - b.x);
    // Leading/trailing spaces are invisible but have width; leave them out of the box.
    while (g.length && !g[0].str.trim()) g.shift();
    while (g.length && !g[g.length - 1].str.trim()) g.pop();
    if (!g.length) return;
    const trimItem = (it: RawItem, side: 'start' | 'end') => {
      const n = it.str.length;
      const t = side === 'start' ? it.str.replace(/^\s+/, '') : it.str.replace(/\s+$/, '');
      if (t.length === n || !n) return it;
      const cut = (it.w * (n - t.length)) / n;
      return side === 'start' ? { ...it, str: t, x: it.x + cut, w: it.w - cut } : { ...it, str: t, w: it.w - cut };
    };
    g[0] = trimItem(g[0], 'start');
    g[g.length - 1] = trimItem(g[g.length - 1], 'end');
    let text = '';
    g.forEach((it, j) => {
      if (j > 0) {
        const prev = g[j - 1];
        const gap = it.x - (prev.x + prev.w);
        if (gap > prev.size * 0.15 && !text.endsWith(' ') && !it.str.startsWith(' ')) text += ' ';
      }
      text += it.str;
    });
    text = text.replace(/\s+$/, '');
    if (!text.trim()) return;
    const first = g[0];
    const last = g[g.length - 1];
    const size = first.size;
    const baseline = first.baseline;
    const x = first.x;
    const w = last.x + last.w - x;
    const y = baseline - first.asc * size;
    const h = (first.asc - first.desc) * size;
    const { color, bg } = sampleColors(ctx, x, y, w, h);
    const { family, bold, italic } = fontInfo(page, first);
    runs.push({ id: `run${i}`, text, x, y, w, h, baseline, size, font: family, bold, italic, color, bg });
  });
  page.cleanup();
  return runs;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function fontInfo(page: any, it: RawItem): { family: FontFamily; bold: boolean; italic: boolean } {
  let name = '';
  let bold = false;
  let italic = false;
  try {
    if (page.commonObjs.has(it.fontName)) {
      const f = page.commonObjs.get(it.fontName);
      name = String(f.name ?? f.fallbackName ?? '');
      bold = !!f.bold || !!f.black;
      italic = !!f.italic;
    }
  } catch {
    /* font not loaded: fall back to name hints */
  }
  const hint = `${name} ${it.family}`.toLowerCase();
  if (/bold|black|heavy|semibold|demi/.test(hint)) bold = true;
  if (/italic|oblique/.test(hint)) italic = true;
  const family: FontFamily = /courier|mono|consol/.test(hint)
    ? 'Courier'
    : /times|serif|georgia|garamond|cambria|book/.test(hint) && !/sans/.test(hint)
      ? 'Times'
      : 'Helvetica';
  return { family, bold, italic };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Background = the most common colour around the box edge; text = the pixel
 * inside the box that differs most from the background.
 */
function sampleColors(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const s = SAMPLE_SCALE;
  const pad = 2 * s;
  const X = Math.max(0, Math.floor(x * s) - pad);
  const Y = Math.max(0, Math.floor(y * s) - pad);
  const W = Math.max(1, Math.min(ctx.canvas.width - X, Math.ceil(w * s) + pad * 2));
  const H = Math.max(1, Math.min(ctx.canvas.height - Y, Math.ceil(h * s) + pad * 2));
  const d = ctx.getImageData(X, Y, W, H).data;
  const px = (i: number) => [d[i * 4], d[i * 4 + 1], d[i * 4 + 2], d[i * 4 + 3]];
  const rgb = (i: number) => {
    const [r, g, b, a] = px(i);
    // Transparent pixels are the white page.
    const k = a / 255;
    return [r * k + 255 * (1 - k), g * k + 255 * (1 - k), b * k + 255 * (1 - k)];
  };

  const counts = new Map<string, { n: number; c: number[] }>();
  const edge = (i: number) => {
    const c = rgb(i);
    const key = c.map((v) => Math.round(v / 8)).join(',');
    const e = counts.get(key) ?? { n: 0, c };
    e.n++;
    counts.set(key, e);
  };
  for (let xx = 0; xx < W; xx++) {
    edge(xx);
    edge((H - 1) * W + xx);
  }
  for (let yy = 0; yy < H; yy++) {
    edge(yy * W);
    edge(yy * W + W - 1);
  }
  let bg = [255, 255, 255];
  let best = 0;
  counts.forEach((e) => {
    if (e.n > best) {
      best = e.n;
      bg = e.c;
    }
  });

  let text = [17, 24, 39];
  let far = -1;
  for (let i = 0; i < W * H; i++) {
    const c = rgb(i);
    const dist = (c[0] - bg[0]) ** 2 + (c[1] - bg[1]) ** 2 + (c[2] - bg[2]) ** 2;
    if (dist > far) {
      far = dist;
      text = c;
    }
  }
  return { color: hex(text[0], text[1], text[2]), bg: hex(bg[0], bg[1], bg[2]) };
}
