import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useHistory } from '../lib/history';
import { DEFAULT_OPTIONS, fitText, newId, type EditObj, type Tool, type ToolOptions } from '../lib/objects';
import { createBlankSource, loadSourceFromFile, validatePdfFile } from '../lib/sources';
import { displaySize, type EditState, type FormValue, type PageRef, type SourceDoc } from '../lib/types';
import { downloadBytes, editedName, exportPdf } from '../lib/exportPdf';
import { PageCanvas } from './PageCanvas';
import { Thumbnails } from './Thumbnails';
import { TopBar, ZOOM_MAX, ZOOM_MIN } from './TopBar';
import { Toolbar } from './Toolbar';
import { PropertiesBar } from './PropertiesBar';
import { SignatureModal, type Signature } from './SignatureModal';
import { FindReplaceModal } from './FindReplaceModal';
import { runToTextObj } from '../lib/replaceText';
import type { TextRun } from '../lib/textRuns';

const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
const PAGE_GAP = 16;
const PAD = 16;
/** Don't blow pages up beyond this when fitting to width on wide screens. */
const FIT_MAX = 1.25;
const EMPTY: EditObj[] = [];

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
const nextStep = (z: number) => ZOOM_STEPS.find((s) => s > z + 0.001) ?? ZOOM_MAX;
const prevStep = (z: number) => [...ZOOM_STEPS].reverse().find((s) => s < z - 0.001) ?? ZOOM_MIN;
const isDesktop = () => window.matchMedia('(min-width: 768px)').matches;
const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/** Move an object's box when its page turns by ±90°, so it stays on the same content. */
function rotateObject(o: EditObj, delta: number, page: PageRef): EditObj {
  const { w: DW, h: DH } = displaySize(page);
  const rot = (((o.rot + delta) % 360) + 360) % 360;
  if (delta === 90) return { ...o, x: DH - o.y - o.h, y: o.x, w: o.h, h: o.w, rot };
  return { ...o, x: o.y, y: DW - o.x - o.w, w: o.h, h: o.w, rot };
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function imageRatio(src: string) {
  return new Promise<{ w: number; h: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });
}

interface Props {
  fileName: string;
  initialSource: SourceDoc;
  initialPages: PageRef[];
  onClose: () => void;
}

export function Editor({ fileName, initialSource, initialPages, onClose }: Props) {
  const primaryId = initialSource.id;
  const [sources, setSources] = useState<Record<string, SourceDoc>>({ [initialSource.id]: initialSource });
  const history = useHistory<EditState>({ pages: initialPages, objects: {}, form: {} });
  const { state, commit, undo, redo } = history;
  const stateRef = useRef(state);
  stateRef.current = state;

  const scrollRef = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const mergeInput = useRef<HTMLInputElement>(null);
  const [zoom, setZoom] = useState(1);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [thumbsOpen, setThumbsOpen] = useState(isDesktop);
  const [tool, setTool] = useState<Tool>('select');
  const [options, setOptions] = useState<ToolOptions>(DEFAULT_OPTIONS);
  const [selected, setSelected] = useState<{ pageId: string; id: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [finding, setFinding] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const scrollRatio = useRef<number | null>(null);

  const pages = state.pages;
  const current = pages[Math.min(currentIndex, pages.length - 1)];
  const currentRef = useRef(current);
  currentRef.current = current;

  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
    window.setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 3500);
  }, []);

  // ---------- zoom & scrolling ----------

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

  const fitWidth = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !stateRef.current.pages.length) return;
    const widest = Math.max(...stateRef.current.pages.map((p) => displaySize(p).w));
    applyZoom(Math.min((el.clientWidth - PAD * 2) / widest, FIT_MAX));
  }, [applyZoom]);

  useEffect(() => {
    fitWidth();
  }, [fitWidth]);

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

  const goToPage = useCallback((index: number) => {
    const el = scrollRef.current;
    const node = el?.querySelectorAll<HTMLElement>('[data-page-number]')[index];
    if (el && node) el.scrollTo({ top: node.offsetTop - PAD, behavior: 'smooth' });
    setCurrentIndex(index);
    if (!isDesktop()) setThumbsOpen(false);
  }, []);

  // ---------- objects ----------

  const updatePageObjects = useCallback(
    (pageId: string, fn: (list: EditObj[]) => EditObj[]) =>
      commit((s) => ({ ...s, objects: { ...s.objects, [pageId]: fn(s.objects[pageId] ?? []) } })),
    [commit],
  );

  const onCreate = useCallback(
    (pageId: string, obj: EditObj, opts: { edit?: boolean; keepTool?: boolean; select?: boolean } = {}) => {
      updatePageObjects(pageId, (list) => [...list, obj]);
      if (opts.select !== false) setSelected({ pageId, id: obj.id });
      if (opts.edit) setEditingId(obj.id);
      if (!opts.keepTool) setTool('select');
    },
    [updatePageObjects],
  );

  const onChange = useCallback(
    (pageId: string, obj: EditObj) => updatePageObjects(pageId, (list) => list.map((o) => (o.id === obj.id ? obj : o))),
    [updatePageObjects],
  );

  const onDelete = useCallback(
    (pageId: string, id: string) => {
      updatePageObjects(pageId, (list) => list.filter((o) => o.id !== id));
      setSelected((s) => (s?.id === id ? null : s));
      setEditingId((e) => (e === id ? null : e));
    },
    [updatePageObjects],
  );

  const onSelect = useCallback((pageId: string, id: string | null) => {
    setSelected(id ? { pageId, id } : null);
    setEditingId((e) => (e && e !== id ? null : e));
  }, []);

  const onFormChange = useCallback(
    (key: string, value: FormValue) => commit((s) => ({ ...s, form: { ...s.form, [key]: value } })),
    [commit],
  );

  const selectedObj = useMemo(
    () => (selected ? (state.objects[selected.pageId] ?? []).find((o) => o.id === selected.id) ?? null : null),
    [selected, state.objects],
  );

  // Changing a setting also changes the selected object.
  const onOptions = useCallback(
    (patch: Partial<ToolOptions>) => {
      setOptions((o) => ({ ...o, ...patch }));
      if (!selected || !selectedObj) return;
      const o = selectedObj;
      let next: EditObj = o;
      if (o.type === 'text') {
        next = fitText({
          ...o,
          font: patch.font ?? o.font,
          size: patch.size ?? o.size,
          color: patch.textColor ?? o.color,
          bold: patch.bold ?? o.bold,
          italic: patch.italic ?? o.italic,
        });
      } else if (o.type === 'highlight') {
        if (patch.highlightColor) next = { ...o, color: patch.highlightColor };
      } else if (o.type === 'check') {
        if (patch.strokeColor) next = { ...o, color: patch.strokeColor };
      } else if ('stroke' in o && o.type !== 'whiteout') {
        next = { ...o, color: patch.strokeColor ?? o.color, stroke: patch.strokeWidth ?? o.stroke };
      }
      if (next !== o) onChange(selected.pageId, next);
    },
    [selected, selectedObj, onChange],
  );

  const onPatchSelected = useCallback(
    (patch: { bg?: string; color?: string }) => {
      if (!selected || !selectedObj) return;
      onChange(selected.pageId, { ...selectedObj, ...patch } as EditObj);
    },
    [selected, selectedObj, onChange],
  );

  /** Edit text tool: replace a line of existing text with an editable box over it. */
  const onEditRun = useCallback(
    (pageId: string, run: TextRun) => onCreate(pageId, runToTextObj(run), { edit: true, keepTool: true }),
    [onCreate],
  );

  const applyReplacements = useCallback(
    (changes: { pageId: string; add: EditObj[]; update: EditObj[] }[]) => {
      commit((s) => {
        const objects = { ...s.objects };
        for (const c of changes) {
          const byId = new Map(c.update.map((o) => [o.id, o]));
          objects[c.pageId] = [...(objects[c.pageId] ?? []).map((o) => byId.get(o.id) ?? o), ...c.add];
        }
        return { ...s, objects };
      });
      const n = changes.reduce((k, c) => k + c.add.length + c.update.length, 0);
      notify(`Replaced text in ${n} place${n === 1 ? '' : 's'}.`);
    },
    [commit, notify],
  );

  /** Drop an object in the middle of the visible part of the current page. */
  const placeOnCurrentPage = useCallback(
    (make: (pageW: number, pageH: number) => EditObj) => {
      const page = currentRef.current;
      const { w, h } = displaySize(page);
      const obj = make(w, h);
      const el = scrollRef.current;
      const node = el?.querySelector<HTMLElement>(`[data-page-id="${page.id}"]`);
      let cy = h / 2;
      if (el && node) {
        const visibleMid = (el.scrollTop + el.clientHeight / 2 - node.offsetTop) / zoom;
        cy = Math.min(Math.max(visibleMid, obj.h / 2), h - obj.h / 2);
      }
      onCreate(page.id, { ...obj, x: (w - obj.w) / 2, y: cy - obj.h / 2 });
    },
    [onCreate, zoom],
  );

  const onPickTool = useCallback((t: Tool) => {
    setSelected(null);
    setEditingId(null);
    if (t === 'image') imageInput.current?.click();
    else if (t === 'signature') setSigning(true);
    else setTool(t);
    if (t === 'image' || t === 'signature') setTool('select');
  }, []);

  const insertImage = async (file: File) => {
    if (!/^image\/(png|jpeg)$/.test(file.type)) return notify('Please choose a PNG or JPG image.', true);
    if (file.size > 15 * 1024 * 1024) return notify('That image is larger than 15 MB.', true);
    const src = await readAsDataUrl(file);
    const nat = await imageRatio(src);
    placeOnCurrentPage((pw) => {
      const w = Math.min(nat.w * 0.75, pw * 0.6);
      return { id: newId(), type: 'image', src, x: 0, y: 0, w, h: (w * nat.h) / nat.w, rot: 0 };
    });
  };

  const insertSignature = (sig: Signature) => {
    setSigning(false);
    placeOnCurrentPage((pw) => {
      const w = Math.min(180, pw * 0.5);
      return { id: newId(), type: 'image', src: sig.src, x: 0, y: 0, w, h: w / sig.ratio, rot: 0 };
    });
  };

  const clearPage = useCallback(() => {
    const page = currentRef.current;
    updatePageObjects(page.id, () => []);
    setSelected(null);
  }, [updatePageObjects]);

  // ---------- pages ----------

  const rotatePage = useCallback(
    (index: number, delta: number) =>
      commit((s) => {
        const page = s.pages[index];
        const objects = (s.objects[page.id] ?? []).map((o) => rotateObject(o, delta, page));
        const pagesNext = s.pages.map((p, i) => (i === index ? { ...p, rotation: (((p.rotation + delta) % 360) + 360) % 360 } : p));
        return { ...s, pages: pagesNext, objects: { ...s.objects, [page.id]: objects } };
      }),
    [commit],
  );

  const deletePage = useCallback(
    (index: number) => {
      if (stateRef.current.pages.length <= 1) return;
      commit((s) => ({ ...s, pages: s.pages.filter((_, i) => i !== index) }));
      setSelected(null);
    },
    [commit],
  );

  const movePage = useCallback(
    (from: number, to: number) =>
      commit((s) => {
        const next = [...s.pages];
        const [p] = next.splice(from, 1);
        next.splice(to, 0, p);
        return { ...s, pages: next };
      }),
    [commit],
  );

  const addBlank = useCallback(async () => {
    const page = currentRef.current;
    const { w, h } = displaySize(page);
    const { source, pages: newPages } = await createBlankSource(w, h);
    setSources((s) => ({ ...s, [source.id]: source }));
    const at = stateRef.current.pages.findIndex((p) => p.id === page.id) + 1;
    commit((s) => ({ ...s, pages: [...s.pages.slice(0, at), ...newPages, ...s.pages.slice(at)] }));
    window.setTimeout(() => goToPage(at), 50);
  }, [commit, goToPage]);

  const mergePdf = async (file: File) => {
    const problem = validatePdfFile(file);
    if (problem) return notify(problem, true);
    try {
      const { source, pages: newPages } = await loadSourceFromFile(file);
      setSources((s) => ({ ...s, [source.id]: source }));
      const at = stateRef.current.pages.length;
      commit((s) => ({ ...s, pages: [...s.pages, ...newPages] }));
      notify(`Added ${newPages.length} page${newPages.length === 1 ? '' : 's'} from ${file.name}`);
      window.setTimeout(() => goToPage(at), 80);
    } catch (err) {
      console.error(err);
      notify('Sorry, that PDF couldn’t be read.', true);
    }
  };

  // ---------- export ----------

  const download = async () => {
    setEditingId(null);
    // Let a text box that is being edited commit first.
    (document.activeElement as HTMLElement | null)?.blur();
    await new Promise((r) => setTimeout(r, 30));
    setDownloading(true);
    try {
      const bytes = await exportPdf(primaryId, sources, stateRef.current);
      downloadBytes(bytes, editedName(fileName));
      notify('Your PDF has been downloaded.');
    } catch (err) {
      console.error(err);
      notify('Sorry, something went wrong while creating the PDF.', true);
    } finally {
      setDownloading(false);
    }
  };

  // ---------- keyboard ----------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        applyZoom(nextStep(zoom));
      } else if (mod && e.key === '-') {
        e.preventDefault();
        applyZoom(prevStep(zoom));
      } else if (mod && e.key === '0') {
        e.preventDefault();
        fitWidth();
      }
      if (isTyping(e.target) || signing || finding) return;
      const key = e.key.toLowerCase();
      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        setSelected(null);
      } else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
        setSelected(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        onDelete(selected.pageId, selected.id);
      } else if (e.key === 'Escape') {
        setSelected(null);
        setTool('select');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom, applyZoom, fitWidth, undo, redo, selected, onDelete, signing, finding]);

  const objectCount = (state.objects[current?.id] ?? []).length;

  return (
    <div className="flex h-full flex-col">
      <TopBar
        fileName={fileName}
        pageCount={pages.length}
        currentPage={Math.min(currentIndex + 1, pages.length)}
        zoom={zoom}
        onZoomIn={() => applyZoom(nextStep(zoom))}
        onZoomOut={() => applyZoom(prevStep(zoom))}
        onFitWidth={fitWidth}
        onToggleThumbs={() => setThumbsOpen((o) => !o)}
        thumbsOpen={thumbsOpen}
        onDownload={download}
        downloading={downloading}
        onClose={onClose}
      />
      <Toolbar
        tool={tool}
        onTool={onPickTool}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={() => (undo(), setSelected(null))}
        onRedo={() => (redo(), setSelected(null))}
        onClearPage={clearPage}
        canClear={objectCount > 0}
        onFindReplace={() => setFinding(true)}
      />
      <PropertiesBar tool={tool} options={options} selected={selectedObj} onOptions={onOptions} onPatchSelected={onPatchSelected} />

      <div className="relative flex min-h-0 flex-1">
        {thumbsOpen && (
          <div className="absolute inset-0 z-10 bg-black/30 md:hidden" onClick={() => setThumbsOpen(false)} aria-hidden="true" />
        )}
        <aside
          className={`absolute inset-y-0 left-0 z-20 w-44 overflow-y-auto border-r border-stone-200 bg-stone-50 transition-transform
            md:static md:z-auto md:translate-x-0
            ${thumbsOpen ? 'translate-x-0' : '-translate-x-full md:hidden'}`}
        >
          <Thumbnails
            pages={pages}
            sources={sources}
            currentIndex={currentIndex}
            onSelect={goToPage}
            onRotate={rotatePage}
            onDelete={deletePage}
            onMove={movePage}
            onAddBlank={addBlank}
            onMerge={() => mergeInput.current?.click()}
          />
        </aside>

        <div ref={scrollRef} className="relative min-w-0 flex-1 overflow-auto overscroll-contain" style={{ padding: PAD }}>
          <div className="flex w-max min-w-full flex-col items-center" style={{ gap: PAGE_GAP }}>
            {pages.map((p, i) => (
              <PageCanvas
                key={p.id}
                page={p}
                source={sources[p.sourceId]}
                pageNumber={i + 1}
                zoom={zoom}
                objects={state.objects[p.id] ?? EMPTY}
                tool={tool}
                options={options}
                selectedId={selected?.pageId === p.id ? selected.id : null}
                editingId={editingId}
                formValues={state.form}
                onFormChange={onFormChange}
                onEditRun={onEditRun}
                onCreate={onCreate}
                onChange={onChange}
                onDelete={onDelete}
                onSelect={onSelect}
                onEdit={setEditingId}
              />
            ))}
          </div>
        </div>
      </div>

      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void insertImage(f);
        }}
      />
      <input
        ref={mergeInput}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void mergePdf(f);
        }}
      />

      {finding && (
        <FindReplaceModal
          pages={pages}
          sources={sources}
          objects={state.objects}
          onClose={() => setFinding(false)}
          onApply={applyReplacements}
          onGoToPage={(i) => {
            setFinding(false);
            goToPage(i);
          }}
        />
      )}
      {signing && <SignatureModal onClose={() => setSigning(false)} onDone={insertSignature} />}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg md:bottom-6
            ${toast.error ? 'bg-red-600' : 'bg-stone-900'}`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
