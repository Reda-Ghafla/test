import { PDFDocument } from 'pdf-lib';
import { loadPdf } from './pdfjs';
import { uid } from './id';
import type { PageRef, SourceDoc } from './types';

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export function validatePdfFile(file: File): string | null {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) return 'That file isn’t a PDF. Please choose a .pdf file.';
  if (file.size > MAX_FILE_BYTES) return 'That file is larger than 50 MB.';
  return null;
}

/** Load PDF bytes with pdf.js and describe each of its pages. */
export async function loadSource(bytes: Uint8Array, name: string): Promise<{ source: SourceDoc; pages: PageRef[] }> {
  const pdf = await loadPdf(bytes);
  const source: SourceDoc = { id: uid('src'), name, bytes, pdf };
  const pages = await Promise.all(
    Array.from({ length: pdf.numPages }, async (_, i): Promise<PageRef> => {
      const page = await pdf.getPage(i + 1);
      const [x0, y0, x1, y1] = page.view;
      return {
        id: uid('page'),
        sourceId: source.id,
        sourceIndex: i,
        rotation: 0,
        baseRotate: page.rotate,
        width: x1 - x0,
        height: y1 - y0,
        ox: x0,
        oy: y1,
      };
    }),
  );
  return { source, pages };
}

export async function loadSourceFromFile(file: File) {
  return loadSource(new Uint8Array(await file.arrayBuffer()), file.name);
}

/** A one-page blank PDF of the given size, as a new source. */
export async function createBlankSource(width: number, height: number) {
  const doc = await PDFDocument.create();
  doc.addPage([width, height]);
  return loadSource(await doc.save(), 'Blank page');
}
