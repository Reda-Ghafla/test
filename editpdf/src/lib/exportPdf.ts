import {
  BlendMode,
  LineCapStyle,
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  StandardFonts,
  concatTransformationMatrix,
  degrees,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';
import { compose, rotateBox, translate, unrotatePage, type Mat } from './geometry';
import {
  CHECK_POINTS,
  FONT_METRICS,
  LINE_HEIGHT,
  contentSize,
  lineGeometry,
  strokePath,
  type EditObj,
  type FontFamily,
  type TextObj,
} from './objects';
import { totalRotation, type EditState, type FormValue, type PageRef, type SourceDoc } from './types';

/** [regular, bold, italic, bold italic] */
const STANDARD: Record<FontFamily, StandardFonts[]> = {
  Helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  Times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  Courier: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function dataUrlBytes(src: string) {
  const b64 = src.slice(src.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * The transform from an object's local frame (origin bottom-left of its
 * content, y up, PDF points) to the page's PDF user space.
 *
 *   local (y up) → local (y down) → object rotation → position on the
 *   displayed page → undo page rotation → flip into PDF space (y up,
 *   offset by the view box origin)
 */
export function objectMatrix(o: EditObj, page: PageRef): Mat {
  const { cw, ch } = contentSize(o);
  return compose(
    [1, 0, 0, -1, 0, ch],
    rotateBox(o.rot, cw, ch),
    translate(o.x, o.y),
    unrotatePage(totalRotation(page), page.width, page.height),
    [1, 0, 0, -1, page.ox, page.oy],
  );
}

class Resources {
  private fonts = new Map<string, Promise<PDFFont>>();
  private charsets = new Map<PDFFont, Set<number>>();
  private images = new Map<string, Promise<PDFImage>>();
  constructor(private doc: PDFDocument) {}

  font(family: FontFamily, bold: boolean, italic = false) {
    const key = `${family}-${bold}-${italic}`;
    if (!this.fonts.has(key)) this.fonts.set(key, this.doc.embedFont(STANDARD[family][(bold ? 1 : 0) + (italic ? 2 : 0)]));
    return this.fonts.get(key)!;
  }

  /** Standard PDF fonts only cover Latin-1-ish characters; replace anything else. */
  sanitize(font: PDFFont, text: string) {
    let set = this.charsets.get(font);
    if (!set) {
      set = new Set(font.getCharacterSet());
      this.charsets.set(font, set);
    }
    return Array.from(text, (ch) => (set!.has(ch.codePointAt(0)!) ? ch : '?')).join('');
  }

  image(src: string) {
    if (!this.images.has(src)) {
      const bytes = dataUrlBytes(src);
      this.images.set(src, src.startsWith('data:image/png') ? this.doc.embedPng(bytes) : this.doc.embedJpg(bytes));
    }
    return this.images.get(src)!;
  }
}

async function drawText(page: PDFPage, o: TextObj, cw: number, ch: number, res: Resources) {
  if (o.bg) page.drawRectangle({ x: 0, y: 0, width: cw, height: ch, color: hexToRgb(o.bg) });
  if (o.sx && o.sx !== 1) page.pushOperators(concatTransformationMatrix(o.sx, 0, 0, 1, 0, 0));
  const font = await res.font(o.font, o.bold, o.italic);
  const { asc, desc } = FONT_METRICS[o.font];
  const lineH = o.size * LINE_HEIGHT;
  // Match the CSS line box: half-leading above, then the font's ascent.
  const firstBaseline = (lineH - (asc + desc) * o.size) / 2 + asc * o.size;
  o.text.split('\n').forEach((line, i) => {
    if (!line) return;
    page.drawText(res.sanitize(font, line), {
      x: 0,
      y: ch - (firstBaseline + i * lineH),
      size: o.size,
      font,
      color: hexToRgb(o.color),
    });
  });
}

async function drawObject(page: PDFPage, o: EditObj, res: Resources) {
  const { cw, ch } = contentSize(o);
  switch (o.type) {
    case 'text':
      return drawText(page, o, cw, ch, res);
    case 'whiteout':
      return page.drawRectangle({ x: 0, y: 0, width: cw, height: ch, color: hexToRgb(o.color || '#ffffff') });
    case 'highlight':
      return page.drawRectangle({
        x: 0,
        y: 0,
        width: cw,
        height: ch,
        color: hexToRgb(o.color),
        opacity: 0.4,
        blendMode: BlendMode.Multiply,
      });
    case 'rect':
      return page.drawRectangle({
        x: o.stroke / 2,
        y: o.stroke / 2,
        width: Math.max(cw - o.stroke, 0),
        height: Math.max(ch - o.stroke, 0),
        borderColor: hexToRgb(o.color),
        borderWidth: o.stroke,
      });
    case 'line':
    case 'arrow': {
      const { shaft, head } = lineGeometry(o, cw, ch);
      const color = hexToRgb(o.color);
      page.drawSvgPath(shaft, { x: 0, y: ch, borderColor: color, borderWidth: o.stroke, borderLineCap: LineCapStyle.Round });
      if (head) page.drawSvgPath(head, { x: 0, y: ch, color, borderColor: color, borderWidth: 1 });
      return;
    }
    case 'draw':
      return page.drawSvgPath(strokePath(o.pts, cw / o.vw, ch / o.vh), {
        x: 0,
        y: ch,
        borderColor: hexToRgb(o.color),
        borderWidth: o.stroke,
        borderLineCap: LineCapStyle.Round,
      });
    case 'check': {
      const p = CHECK_POINTS.map((v, i) => (i % 2 ? (v * ch) / 24 : (v * cw) / 24));
      return page.drawSvgPath(`M ${p[0]} ${p[1]} L ${p[2]} ${p[3]} L ${p[4]} ${p[5]}`, {
        x: 0,
        y: ch,
        borderColor: hexToRgb(o.color),
        borderWidth: Math.min(cw, ch) * 0.12,
        borderLineCap: LineCapStyle.Round,
      });
    }
    case 'image': {
      const img = await res.image(o.src);
      return page.drawImage(img, { x: 0, y: 0, width: cw, height: ch });
    }
  }
}

/** Isolate the page's existing content in q … Q so its graphics state can't leak into ours. */
function wrapExistingContent(doc: PDFDocument, page: PDFPage) {
  page.node.normalize();
  const start = doc.context.register(doc.context.contentStream([pushGraphicsState()]));
  const end = doc.context.register(doc.context.contentStream([popGraphicsState()]));
  page.node.wrapContentStreams(start, end);
}

function applyFormValues(doc: PDFDocument, values: [string, FormValue][]) {
  if (!values.length) return false;
  const form = doc.getForm();
  for (const [name, value] of values) {
    try {
      const field = form.getFieldMaybe(name);
      if (field instanceof PDFTextField) field.setText(String(value));
      else if (field instanceof PDFCheckBox) (value ? field.check() : field.uncheck());
      else if (field instanceof PDFRadioGroup && typeof value === 'string' && value) field.select(value);
      else if ((field instanceof PDFDropdown || field instanceof PDFOptionList) && typeof value === 'string' && value)
        field.select(value);
    } catch (err) {
      console.warn(`Could not set form field "${name}"`, err);
    }
  }
  return true;
}

/**
 * Build the edited PDF. The original file is used as the base document, so
 * its metadata, outline and (filled-in, still fillable) form survive; pages
 * from merged files and blank pages are copied in.
 */
export async function exportPdf(
  primaryId: string,
  sources: Record<string, SourceDoc>,
  state: EditState,
): Promise<Uint8Array> {
  const libDocs = new Map<string, PDFDocument>();
  const load = async (id: string) => {
    if (!libDocs.has(id)) {
      const doc = await PDFDocument.load(sources[id].bytes, { ignoreEncryption: true, updateMetadata: false });
      const values = Object.entries(state.form)
        .filter(([k]) => k.startsWith(`${id}::`))
        .map(([k, v]) => [k.slice(id.length + 2), v] as [string, FormValue]);
      const changed = applyFormValues(doc, values);
      // Forms from merged files can't be merged into the main form; burn their values in.
      if (changed && id !== primaryId) {
        try {
          doc.getForm().flatten();
        } catch (err) {
          console.warn('Could not flatten form', err);
        }
      }
      libDocs.set(id, doc);
    }
    return libDocs.get(id)!;
  };

  const main = await load(primaryId);
  const originalPages = main.getPages();
  for (let i = main.getPageCount() - 1; i >= 0; i--) main.removePage(i);

  const res = new Resources(main);
  for (const ref of state.pages) {
    let page: PDFPage;
    if (ref.sourceId === primaryId) {
      page = originalPages[ref.sourceIndex];
      main.addPage(page);
    } else {
      const src = await load(ref.sourceId);
      [page] = await main.copyPages(src, [ref.sourceIndex]);
      main.addPage(page);
    }
    page.setRotation(degrees(totalRotation(ref)));

    const objects = state.objects[ref.id] ?? [];
    if (!objects.length) continue;
    wrapExistingContent(main, page);
    for (const o of objects) {
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...objectMatrix(o, ref)));
      await drawObject(page, o, res);
      page.pushOperators(popGraphicsState());
    }
  }

  main.setProducer('EditPDF');
  main.setModificationDate(new Date());
  return main.save();
}

export function downloadBytes(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const editedName = (name: string) => `${name.replace(/\.pdf$/i, '') || 'document'}-edited.pdf`;
