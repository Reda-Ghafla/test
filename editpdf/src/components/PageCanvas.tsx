import { memo } from 'react';
import type { PageRef, SourceDoc } from '../lib/types';
import { useRenderPage } from '../lib/useRenderPage';
import { useInView } from '../lib/useInView';

interface Props {
  page: PageRef;
  source: SourceDoc;
  pageNumber: number;
  zoom: number;
}

/**
 * Renders a single PDF page. The canvas only renders once it is near the
 * viewport, so large documents stay fast. Editing overlays will be layered on
 * top of the canvas inside the same relatively-positioned box.
 */
export const PageCanvas = memo(function PageCanvas({ page, source, pageNumber, zoom }: Props) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const { canvasRef, width, height, ready, rendered } = useRenderPage(
    source.pdf,
    page.sourceIndex,
    zoom,
    page.rotation,
    inView,
  );

  return (
    <div
      ref={ref}
      data-page-id={page.id}
      data-page-number={pageNumber}
      className="relative mx-auto bg-white shadow-md ring-1 ring-stone-300"
      style={{ width: ready ? width : 600 * zoom, height: ready ? height : 800 * zoom }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      {!rendered && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-stone-400">
          Loading page {pageNumber}…
        </div>
      )}
    </div>
  );
});
