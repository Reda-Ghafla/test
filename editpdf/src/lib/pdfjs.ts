import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Open a PDF with pdf.js. pdf.js transfers the buffer to its worker, so we
 * always hand it a copy and keep the original bytes intact for pdf-lib export.
 */
export async function loadPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  // fontExtraProperties exposes font names (e.g. "Arial-BoldMT"), used to detect bold/italic text.
  const task = pdfjsLib.getDocument({ data: bytes.slice(), fontExtraProperties: true });
  return task.promise;
}

export type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
