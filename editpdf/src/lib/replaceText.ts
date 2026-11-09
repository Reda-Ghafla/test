import { FONT_METRICS, LINE_HEIGHT, fitText, measureText, newId, type TextObj } from './objects';
import type { TextRun } from './textRuns';

/**
 * A text object that sits exactly over an existing line of PDF text, with a
 * background that hides the original. Its baseline lines up with the original.
 */
export function runToTextObj(run: TextRun, text = run.text): TextObj {
  const { asc, desc } = FONT_METRICS[run.font];
  const size = Math.round(run.size * 100) / 100;
  const firstBaseline = ((LINE_HEIGHT - (asc + desc)) / 2 + asc) * size;
  // How much wider/narrower the original font is than ours, for the same text.
  const ours = measureText(run.text, run.font, size, run.bold, run.italic).w - 2;
  const sx = ours > 0 ? Math.min(1.4, Math.max(0.7, run.w / ours)) : 1;
  return fitText({
    id: newId(),
    type: 'text',
    text,
    font: run.font,
    size,
    color: run.color,
    bold: run.bold,
    italic: run.italic,
    bg: run.bg,
    minW: run.w + 3,
    sx: Math.round(sx * 1000) / 1000,
    x: run.x - 1.5,
    y: run.baseline - firstBaseline,
    w: 0,
    h: 0,
    rot: 0,
  });
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function makeMatcher(find: string, matchCase: boolean, wholeWord: boolean) {
  if (!find) return null;
  const body = escape(find);
  return new RegExp(wholeWord ? `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])` : body, matchCase ? 'gu' : 'giu');
}
