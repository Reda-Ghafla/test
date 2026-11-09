import type { PDFDocumentProxy } from './pdfjs';

/** A PDF file loaded into the editor (the original upload, or a merged one later). */
export interface SourceDoc {
  id: string;
  name: string;
  bytes: Uint8Array;
  pdf: PDFDocumentProxy;
}

/**
 * One page in the editor's page list. Pages reference a page of a source
 * document, so reordering / deleting / merging never mutates the originals.
 */
export interface PageRef {
  id: string;
  sourceId: string;
  /** 0-based page index inside the source document. */
  sourceIndex: number;
  /** Extra rotation applied by the user, in degrees (0/90/180/270). */
  rotation: number;
}

export interface EditorDoc {
  fileName: string;
  sources: Record<string, SourceDoc>;
  pages: PageRef[];
}
