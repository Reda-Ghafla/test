import { useEffect, useRef, useState } from 'react';
import { AnnotationMode } from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from './pdfjs';

/**
 * Render one PDF page into a canvas at `scale` (CSS pixels per PDF point),
 * crisp on high-DPI screens. Returns the canvas ref and the page's CSS size.
 * `enabled` lets callers defer rendering until the page scrolls into view.
 */
export function useRenderPage(
  pdf: PDFDocumentProxy,
  pageIndex: number,
  scale: number,
  rotation: number,
  enabled = true,
  /** Leave form-field widgets out, because the editor draws live inputs on top. */
  hideFormFields = false,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    pdf.getPage(pageIndex + 1).then((p) => {
      if (!cancelled) setPage(p);
    });
    return () => {
      cancelled = true;
    };
  }, [pdf, pageIndex]);

  const viewport = page
    ? page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 })
    : null;
  const width = viewport?.width ?? 0;
  const height = viewport?.height ?? 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!page || !canvas || !enabled) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const vp = page.getViewport({ scale: scale * dpr, rotation: (page.rotate + rotation) % 360 });
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    const task = page.render({
      canvas,
      viewport: vp,
      annotationMode: hideFormFields ? AnnotationMode.ENABLE_FORMS : AnnotationMode.ENABLE,
    });
    task.promise.then(
      () => setRendered(true),
      (err: unknown) => {
        if ((err as { name?: string })?.name !== 'RenderingCancelledException') console.error(err);
      },
    );
    return () => task.cancel();
  }, [page, scale, rotation, enabled, hideFormFields]);

  return { canvasRef, width, height, ready: !!page, rendered };
}
