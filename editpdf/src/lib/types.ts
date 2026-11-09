import type { PDFDocumentProxy } from './pdfjs';
import type { EditObj } from './objects';

/** A PDF file loaded into the editor: the original upload, a merged file or a blank page. */
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
  /** Rotation added by the user, in degrees (0/90/180/270). */
  rotation: number;
  /** The page's own /Rotate value from the file. */
  baseRotate: number;
  /** Unrotated page size in PDF points (pdf.js "view" box, i.e. the visible crop box). */
  width: number;
  height: number;
  /** PDF user-space coordinates of the view box's top-left corner (view[0], view[3]). */
  ox: number;
  oy: number;
}

export type FormValue = string | boolean;

/** Everything that undo/redo covers. */
export interface EditState {
  pages: PageRef[];
  /** Objects per page id, in display space (see objects.ts). */
  objects: Record<string, EditObj[]>;
  /** Form field values the user changed, keyed by `${sourceId}::${fieldName}`. */
  form: Record<string, FormValue>;
}

export const totalRotation = (p: PageRef) => (((p.baseRotate + p.rotation) % 360) + 360) % 360;

/** Page size at zoom 1 as shown on screen (rotation applied). */
export function displaySize(p: PageRef) {
  const r = totalRotation(p);
  return r % 180 === 0 ? { w: p.width, h: p.height } : { w: p.height, h: p.width };
}

export const formKey = (sourceId: string, fieldName: string) => `${sourceId}::${fieldName}`;
