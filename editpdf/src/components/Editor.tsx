import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EditorDoc } from '../lib/types';
import { PageCanvas } from './PageCanvas';
import { Thumbnails } from './Thumbnails';
import { Toolbar, ZOOM_MAX, ZOOM_MIN } from './Toolbar';

const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
const PAGE_GAP = 16;
const PAD = 16;
/** Don't blow pages up beyond this when fitting to width on wide screens. */
const FIT_MAX = 1.25;

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
const nextStep = (z: number) => ZOOM_STEPS.find((s) => s > z + 0.001) ?? ZOOM_MAX;
const prevStep = (z: number) => [...ZOOM_STEPS].reverse().find((s) => s < z - 0.001) ?? ZOOM_MIN;
const isDesktop = () => window.matchMedia('(min-width: 768px)').matches;

interface Props {
  doc: EditorDoc;
  onClose: () => void;
}

export function Editor({ doc, onClose }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [thumbsOpen, setThumbsOpen] = useState(isDesktop);
  const scrollRatio = useRef<number | null>(null);

  /** Change zoom while keeping the same spot of the document in view. */
  const applyZoom = useCallback((z: number) => {
    const el = scrollRef.current;
    if (el && el.scrollHeight > 0) scrollRatio.current = el.scrollTop / el.scrollHeight;
    setZoom(clampZoom(Math.round(z * 100) / 100));
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && scrollRatio.current !== null) {
      el.scrollTop = scrollRatio.current * el.scrollHeight;
      scrollRatio.current = null;
    }
  }, [zoom]);

  const fitWidth = useCallback(async () => {
    const el = scrollRef.current;
    if (!el || doc.pages.length === 0) return;
    // Fit the widest page (checking the first 50), so mixed portrait/landscape
    // documents don't scroll sideways.
    const widths = await Promise.all(
      doc.pages.slice(0, 50).map(async (p) => {
        const page = await doc.sources[p.sourceId].pdf.getPage(p.sourceIndex + 1);
        return page.getViewport({ scale: 1, rotation: (page.rotate + p.rotation) % 360 }).width;
      }),
    );
    const available = el.clientWidth - PAD * 2;
    applyZoom(Math.min(available / Math.max(...widths), FIT_MAX));
  }, [doc, applyZoom]);

  // Fit to width when a document is first opened.
  useEffect(() => {
    void fitWidth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.fileName]);

  // Track which page is in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const probe = el.scrollTop + el.clientHeight * 0.35;
        const nodes = el.querySelectorAll<HTMLElement>('[data-page-number]');
        let idx = 0;
        nodes.forEach((n, i) => {
          if (n.offsetTop <= probe) idx = i;
        });
        setCurrentIndex(idx);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Ctrl/Cmd + wheel (and trackpad pinch) zooms.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      applyZoom(zoom * Math.exp(-e.deltaY * 0.0025));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom, applyZoom]);

  // Keyboard: Ctrl/Cmd + '+', '-', '0'.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        applyZoom(nextStep(zoom));
      } else if (e.key === '-') {
        e.preventDefault();
        applyZoom(prevStep(zoom));
      } else if (e.key === '0') {
        e.preventDefault();
        void fitWidth();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom, applyZoom, fitWidth]);

  const goToPage = useCallback((index: number) => {
    const el = scrollRef.current;
    const node = el?.querySelectorAll<HTMLElement>('[data-page-number]')[index];
    if (el && node) el.scrollTo({ top: node.offsetTop - PAD, behavior: 'smooth' });
    if (!isDesktop()) setThumbsOpen(false);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        fileName={doc.fileName}
        pageCount={doc.pages.length}
        currentPage={currentIndex + 1}
        zoom={zoom}
        onZoomIn={() => applyZoom(nextStep(zoom))}
        onZoomOut={() => applyZoom(prevStep(zoom))}
        onFitWidth={() => void fitWidth()}
        onToggleThumbs={() => setThumbsOpen((o) => !o)}
        thumbsOpen={thumbsOpen}
        onClose={onClose}
      />

      <div className="relative flex min-h-0 flex-1">
        {/* Thumbnail sidebar: docked on desktop, slide-over drawer on mobile. */}
        {thumbsOpen && (
          <div
            className="absolute inset-0 z-10 bg-black/30 md:hidden"
            onClick={() => setThumbsOpen(false)}
            aria-hidden="true"
          />
        )}
        <aside
          className={`absolute inset-y-0 left-0 z-20 w-44 overflow-y-auto border-r border-stone-200 bg-stone-50 transition-transform
            md:static md:z-auto md:translate-x-0
            ${thumbsOpen ? 'translate-x-0' : '-translate-x-full md:hidden'}`}
        >
          <Thumbnails doc={doc} currentIndex={currentIndex} onSelect={goToPage} />
        </aside>

        <div
          ref={scrollRef}
          className="relative min-w-0 flex-1 overflow-auto overscroll-contain"
          style={{ padding: PAD }}
        >
          <div className="flex w-max min-w-full flex-col items-center" style={{ gap: PAGE_GAP }}>
            {doc.pages.map((p, i) => (
              <PageCanvas key={p.id} page={p} source={doc.sources[p.sourceId]} pageNumber={i + 1} zoom={zoom} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
