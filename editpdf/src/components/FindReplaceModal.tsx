import { useEffect, useMemo, useState } from 'react';
import type { EditObj, TextObj } from '../lib/objects';
import { fitText } from '../lib/objects';
import { makeMatcher, runToTextObj } from '../lib/replaceText';
import { getTextRuns, type TextRun } from '../lib/textRuns';
import type { PageRef, SourceDoc } from '../lib/types';
import { isCovered } from './TextEditLayer';
import { Icon } from './icons';

interface Props {
  pages: PageRef[];
  sources: Record<string, SourceDoc>;
  objects: Record<string, EditObj[]>;
  onClose: () => void;
  /** Apply all changes as one undo step. */
  onApply: (changes: { pageId: string; add: EditObj[]; update: EditObj[] }[]) => void;
  onGoToPage: (index: number) => void;
}

interface PageRuns {
  page: PageRef;
  index: number;
  runs: TextRun[];
}

/** Search the whole document's text and replace every match. */
export function FindReplaceModal({ pages, sources, objects, onClose, onApply, onGoToPage }: Props) {
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [all, setAll] = useState<PageRuns[] | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Read the text of every page once (cached for later).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: PageRuns[] = [];
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        try {
          out.push({ page: p, index: i, runs: await getTextRuns(sources[p.sourceId].pdf, p) });
        } catch {
          out.push({ page: p, index: i, runs: [] });
        }
        if (cancelled) return;
        setProgress(i + 1);
      }
      setAll(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [pages, sources]);

  const matcher = useMemo(() => makeMatcher(find, matchCase, wholeWord), [find, matchCase, wholeWord]);

  /** Every place the search text appears: in original text, or in text you already edited. */
  const hits = useMemo(() => {
    if (!all || !matcher) return [];
    const list: { pageIndex: number; pageId: string; run?: TextRun; obj?: TextObj; text: string; count: number }[] = [];
    for (const { page, index, runs } of all) {
      const objs = objects[page.id] ?? [];
      for (const o of objs) {
        if (o.type !== 'text') continue;
        const n = o.text.match(matcher)?.length ?? 0;
        if (n) list.push({ pageIndex: index, pageId: page.id, obj: o, text: o.text, count: n });
      }
      for (const r of runs) {
        if (isCovered(r, objs)) continue;
        const n = r.text.match(matcher)?.length ?? 0;
        if (n) list.push({ pageIndex: index, pageId: page.id, run: r, text: r.text, count: n });
      }
    }
    return list;
  }, [all, matcher, objects]);

  const total = hits.reduce((n, h) => n + h.count, 0);

  const apply = () => {
    if (!matcher || !hits.length) return;
    const byPage = new Map<string, { pageId: string; add: EditObj[]; update: EditObj[] }>();
    for (const h of hits) {
      const entry = byPage.get(h.pageId) ?? { pageId: h.pageId, add: [], update: [] };
      const next = h.text.replace(matcher, replace);
      if (h.obj) entry.update.push(fitText({ ...h.obj, text: next }));
      else if (h.run) entry.add.push(runToTextObj(h.run, next));
      byPage.set(h.pageId, entry);
    }
    onApply([...byPage.values()]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/50 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Find and replace"
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-900">Find and replace</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100">
            <Icon name="close" />
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm font-medium text-stone-700">
            Find
            <input
              autoFocus
              value={find}
              onChange={(e) => setFind(e.target.value)}
              className="h-11 rounded-xl border border-stone-300 px-3 text-base font-normal outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-stone-700">
            Replace with
            <input
              value={replace}
              onChange={(e) => setReplace(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && apply()}
              className="h-11 rounded-xl border border-stone-300 px-3 text-base font-normal outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
          </label>
          <div className="flex flex-wrap gap-4 text-sm text-stone-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} className="h-4 w-4 accent-brand-700" />
              Match case
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} className="h-4 w-4 accent-brand-700" />
              Whole words
            </label>
          </div>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-xl bg-stone-50 p-2 text-sm ring-1 ring-stone-200">
          {!all ? (
            <p className="p-2 text-stone-500">
              Reading the document… page {progress} of {pages.length}
            </p>
          ) : !find ? (
            <p className="p-2 text-stone-500">Type the text you want to find.</p>
          ) : !hits.length ? (
            <p className="p-2 text-stone-500">No matches.</p>
          ) : (
            <>
              <p className="px-2 pb-1 font-medium text-stone-700">
                {total} match{total === 1 ? '' : 'es'}
              </p>
              <ul className="grid gap-1">
                {hits.slice(0, 100).map((h, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => onGoToPage(h.pageIndex)}
                      className="flex w-full items-baseline gap-2 rounded-lg px-2 py-1 text-left hover:bg-white"
                    >
                      <span className="shrink-0 text-xs text-stone-400">p.{h.pageIndex + 1}</span>
                      <span className="truncate text-stone-700">{h.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-stone-600 hover:bg-stone-100">
            Cancel
          </button>
          <button
            type="button"
            disabled={!total}
            onClick={apply}
            className="rounded-xl bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Replace all{total ? ` (${total})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
