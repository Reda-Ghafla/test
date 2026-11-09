import { memo, useEffect, useState } from 'react';
import type { PDFDocumentProxy } from '../lib/pdfjs';
import { formKey, totalRotation, type FormValue, type PageRef } from '../lib/types';

interface Field {
  id: string;
  name: string;
  kind: 'text' | 'checkbox' | 'radio' | 'select';
  multiline: boolean;
  readOnly: boolean;
  /** Display-space box at zoom 1. */
  x: number;
  y: number;
  w: number;
  h: number;
  defaultValue: FormValue;
  /** Export value of this radio button / checkbox. */
  onValue: string;
  options: { value: string; label: string }[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function loadFields(pdf: PDFDocumentProxy, page: PageRef): Promise<Field[]> {
  const p = await pdf.getPage(page.sourceIndex + 1);
  const viewport = p.getViewport({ scale: 1, rotation: totalRotation(page) });
  const annots: any[] = await p.getAnnotations({ intent: 'display' });
  const fields: Field[] = [];
  for (const a of annots) {
    if (a.subtype !== 'Widget' || !a.fieldName || a.pushButton || a.hidden) continue;
    const [x1, y1] = viewport.convertToViewportPoint(a.rect[0], a.rect[1]);
    const [x2, y2] = viewport.convertToViewportPoint(a.rect[2], a.rect[3]);
    const base = {
      id: a.id,
      name: a.fieldName as string,
      multiline: !!a.multiLine,
      readOnly: !!a.readOnly,
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.abs(x2 - x1),
      h: Math.abs(y2 - y1),
      onValue: '',
      options: [] as Field['options'],
    };
    if (a.fieldType === 'Tx') {
      fields.push({ ...base, kind: 'text', defaultValue: typeof a.fieldValue === 'string' ? a.fieldValue : '' });
    } else if (a.fieldType === 'Btn' && a.checkBox) {
      fields.push({
        ...base,
        kind: 'checkbox',
        onValue: a.exportValue ?? 'Yes',
        defaultValue: !!a.fieldValue && a.fieldValue !== 'Off',
      });
    } else if (a.fieldType === 'Btn' && a.radioButton) {
      fields.push({
        ...base,
        kind: 'radio',
        onValue: String(a.buttonValue ?? ''),
        defaultValue: typeof a.fieldValue === 'string' && a.fieldValue !== 'Off' ? a.fieldValue : '',
      });
    } else if (a.fieldType === 'Ch') {
      const options = (a.options ?? []).map((o: any) => ({ value: String(o.exportValue), label: String(o.displayValue) }));
      const fv = Array.isArray(a.fieldValue) ? a.fieldValue[0] : a.fieldValue;
      fields.push({ ...base, kind: 'select', options, defaultValue: typeof fv === 'string' ? fv : '' });
    }
  }
  return fields;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface Props {
  pdf: PDFDocumentProxy;
  page: PageRef;
  zoom: number;
  values: Record<string, FormValue>;
  interactive: boolean;
  onChange: (key: string, value: FormValue) => void;
}

/** HTML inputs laid over the page's AcroForm widgets. */
export const FormLayer = memo(function FormLayer({ pdf, page, zoom, values, interactive, onChange }: Props) {
  const [fields, setFields] = useState<Field[]>([]);
  useEffect(() => {
    let cancelled = false;
    loadFields(pdf, page).then(
      (f) => !cancelled && setFields(f),
      (err) => console.warn('Could not read form fields', err),
    );
    return () => {
      cancelled = true;
    };
  }, [pdf, page]);

  if (!fields.length) return null;
  return (
    <>
      {fields.map((f) => {
        const key = formKey(page.sourceId, f.name);
        const value = key in values ? values[key] : f.defaultValue;
        const style: React.CSSProperties = {
          left: f.x * zoom,
          top: f.y * zoom,
          width: f.w * zoom,
          height: f.h * zoom,
          fontSize: Math.max(6, Math.min(f.h * 0.65, 14)) * zoom,
          pointerEvents: interactive ? 'auto' : 'none',
        };
        const cls = 'absolute z-[1] bg-sky-100/50 text-stone-900 outline-none ring-1 ring-sky-400/60 focus:bg-sky-100/80 focus:ring-2 focus:ring-sky-500';
        const common = { 'aria-label': f.name, title: f.name, disabled: f.readOnly, 'data-field': f.name };
        if (f.kind === 'text')
          return <TextField key={f.id} cls={cls} style={style} common={common} multiline={f.multiline} value={String(value)} onCommit={(v) => onChange(key, v)} />;
        if (f.kind === 'checkbox' || f.kind === 'radio') {
          const checked = f.kind === 'checkbox' ? !!value : value === f.onValue;
          return (
            <label key={f.id} className={`${cls} flex cursor-pointer items-center justify-center`} style={style}>
              <input
                {...common}
                type="checkbox"
                className="peer sr-only"
                checked={checked}
                onChange={(e) => onChange(key, f.kind === 'checkbox' ? e.target.checked : e.target.checked ? f.onValue : '')}
              />
              <span className="font-bold leading-none" style={{ fontSize: Math.min(f.w, f.h) * 0.9 * zoom }}>
                {checked ? (f.kind === 'radio' ? '●' : '✓') : ''}
              </span>
            </label>
          );
        }
        return (
          <select key={f.id} {...common} className={cls} style={style} value={String(value)} onChange={(e) => onChange(key, e.target.value)}>
            <option value="" />
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
      })}
    </>
  );
});

function TextField({
  cls,
  style,
  common,
  multiline,
  value,
  onCommit,
}: {
  cls: string;
  style: React.CSSProperties;
  common: Record<string, unknown>;
  multiline: boolean;
  value: string;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const props = {
    ...common,
    className: `${cls} px-1`,
    style,
    value: local,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setLocal(e.target.value),
    onBlur: () => local !== value && onCommit(local),
  };
  return multiline ? <textarea {...props} className={`${props.className} resize-none`} /> : <input type="text" {...props} />;
}
