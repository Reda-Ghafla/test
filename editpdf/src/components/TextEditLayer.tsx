import { memo, useEffect, useState } from 'react';
import type { PDFDocumentProxy } from '../lib/pdfjs';
import type { EditObj } from '../lib/objects';
import { getTextRuns, type TextRun } from '../lib/textRuns';
import type { PageRef } from '../lib/types';

interface Props {
  pdf: PDFDocumentProxy;
  page: PageRef;
  zoom: number;
  objects: EditObj[];
  onPick: (pageId: string, run: TextRun) => void;
}

/** True when an existing replacement box already sits over this run. */
export function isCovered(run: TextRun, objects: EditObj[]) {
  const cx = run.x + run.w / 2;
  const cy = run.baseline - run.size * 0.3;
  return objects.some((o) => o.type === 'text' && o.bg && cx >= o.x && cx <= o.x + o.w && cy >= o.y && cy <= o.y + o.h);
}

/** In "Edit text" mode: outlines every line of existing text so it can be clicked and changed. */
export const TextEditLayer = memo(function TextEditLayer({ pdf, page, zoom, objects, onPick }: Props) {
  const [runs, setRuns] = useState<TextRun[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRuns(null);
    getTextRuns(pdf, page).then(
      (r) => !cancelled && setRuns(r),
      (err) => {
        console.warn('Could not read page text', err);
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [pdf, page]);

  const status = failed
    ? 'Couldn’t read the text on this page.'
    : !runs
      ? 'Finding text…'
      : runs.length === 0
        ? 'No editable text on this page — it may be a scanned image. Use White-out and Text instead.'
        : null;

  return (
    <>
      {status && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[3] max-w-[90%] -translate-x-1/2 rounded-full bg-stone-900/85 px-3 py-1.5 text-center text-xs font-medium text-white shadow">
          {status}
        </div>
      )}
      {runs
        ?.filter((r) => !isCovered(r, objects))
        .map((r) => (
          <button
            key={r.id}
            type="button"
            title="Click to edit this text"
            aria-label={`Edit text: ${r.text}`}
            data-run={r.text}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPick(page.id, r);
            }}
            className="absolute z-[1] cursor-text rounded-[2px] bg-sky-400/10 outline-1 outline-sky-500/40 transition hover:bg-sky-400/25 hover:outline-2 hover:outline-sky-600"
            style={{
              left: (r.x - 1) * zoom,
              top: (r.y - 1) * zoom,
              width: (r.w + 2) * zoom,
              height: (r.h + 2) * zoom,
            }}
          />
        ))}
    </>
  );
});
