import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Open a PDF with pdf.js. pdf.js transfers the buffer to its worker, so we
 * always hand it a copy and keep the original bytes intact for pdf-lib export.
 */
export async function loadPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const task = pdfjsLib.getDocument({ data: bytes.slice() });
  return task.promise;
}

export type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
