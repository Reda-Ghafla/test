import { memo } from 'react';
import type { EditObj, Tool, ToolOptions } from '../lib/objects';
import { displaySize, type FormValue, type PageRef, type SourceDoc } from '../lib/types';
import { useRenderPage } from '../lib/useRenderPage';
import { useInView } from '../lib/useInView';
import { ObjectLayer, type ObjectLayerProps } from './ObjectLayer';
import { FormLayer } from './FormLayer';

type Handlers = Pick<ObjectLayerProps, 'onCreate' | 'onChange' | 'onDelete' | 'onSelect' | 'onEdit'>;

interface Props extends Handlers {
  page: PageRef;
  source: SourceDoc;
  pageNumber: number;
  zoom: number;
  objects: EditObj[];
  tool: Tool;
  options: ToolOptions;
  selectedId: string | null;
  editingId: string | null;
  formValues: Record<string, FormValue>;
  onFormChange: (key: string, value: FormValue) => void;
}

/**
 * One page: the pdf.js canvas, with the form-field and object layers on top.
 * The canvas only renders once it is near the viewport, so large documents
 * stay fast.
 */
export const PageCanvas = memo(function PageCanvas(props: Props) {
  const { page, source, pageNumber, zoom } = props;
  const { ref, inView } = useInView<HTMLDivElement>();
  const { canvasRef, rendered } = useRenderPage(source.pdf, page.sourceIndex, zoom, page.rotation, inView, true);
  const { w, h } = displaySize(page);

  return (
    <div
      ref={ref}
      data-page-id={page.id}
      data-page-number={pageNumber}
      className="relative mx-auto shrink-0 bg-white shadow-md ring-1 ring-stone-300"
      style={{ width: w * zoom, height: h * zoom }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
      {!rendered && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-stone-400">
          Loading page {pageNumber}…
        </div>
      )}
      {inView && (
        <ObjectLayer
          pageId={page.id}
          width={w}
          height={h}
          zoom={zoom}
          objects={props.objects}
          tool={props.tool}
          options={props.options}
          selectedId={props.selectedId}
          editingId={props.editingId}
          onCreate={props.onCreate}
          onChange={props.onChange}
          onDelete={props.onDelete}
          onSelect={props.onSelect}
          onEdit={props.onEdit}
        >
          <FormLayer
            pdf={source.pdf}
            page={page}
            zoom={zoom}
            values={props.formValues}
            interactive={props.tool === 'select'}
            onChange={props.onFormChange}
          />
        </ObjectLayer>
      )}
    </div>
  );
});
