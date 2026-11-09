import type { EditObj, FontFamily, Tool, ToolOptions } from '../lib/objects';

const COLORS = ['#111827', '#1d4ed8', '#dc2626', '#15803d', '#7c3aed', '#ea580c'];
const HIGHLIGHTS = ['#fde047', '#86efac', '#93c5fd', '#f9a8d4', '#fdba74'];

type Kind = 'text' | 'stroke' | 'highlight' | 'whiteout' | 'none';

const kindOfTool = (t: Tool): Kind =>
  t === 'text' || t === 'date'
    ? 'text'
    : t === 'draw' || t === 'rect' || t === 'line' || t === 'arrow' || t === 'check'
      ? 'stroke'
      : t === 'highlight'
        ? 'highlight'
        : t === 'whiteout'
          ? 'whiteout'
          : 'none';

const kindOfObj = (o: EditObj): Kind =>
  o.type === 'text' ? 'text' : o.type === 'highlight' ? 'highlight' : o.type === 'whiteout' ? 'whiteout' : o.type === 'image' ? 'none' : 'stroke';

interface Props {
  tool: Tool;
  options: ToolOptions;
  selected: EditObj | null;
  onOptions: (patch: Partial<ToolOptions>) => void;
}

function Swatches({ colors, value, onPick, label }: { colors: string[]; value: string; onPick: (c: string) => void; label: string }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`${label} ${c}`}
          onClick={() => onPick(c)}
          className={`h-6 w-6 shrink-0 rounded-full ring-offset-1 transition ${value.toLowerCase() === c ? 'ring-2 ring-brand-600' : 'ring-1 ring-stone-300'}`}
          style={{ background: c }}
        />
      ))}
      <label className="relative h-6 w-6 shrink-0 cursor-pointer overflow-hidden rounded-full bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)] ring-1 ring-stone-300" title="Custom colour">
        <input type="color" value={value} onChange={(e) => onPick(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={`Custom ${label}`} />
      </label>
    </div>
  );
}

/**
 * Settings for the current tool. When an object is selected, the controls
 * show (and change) that object's properties instead.
 */
export function PropertiesBar({ tool, options, selected, onOptions }: Props) {
  const kind = selected ? kindOfObj(selected) : kindOfTool(tool);
  if (kind === 'none') return null;

  const o: ToolOptions = { ...options };
  if (selected?.type === 'text') Object.assign(o, { font: selected.font, size: selected.size, textColor: selected.color, bold: selected.bold });
  else if (selected && 'stroke' in selected) Object.assign(o, { strokeColor: selected.color, strokeWidth: selected.stroke });
  else if (selected?.type === 'check') o.strokeColor = selected.color;
  if (selected?.type === 'highlight') o.highlightColor = selected.color;

  return (
    <div className="z-10 flex shrink-0 items-center gap-3 overflow-x-auto border-b border-stone-200 bg-stone-50 px-3 py-2 text-sm [scrollbar-width:none] md:justify-center">
      {kind === 'text' && (
        <>
          <select
            aria-label="Font"
            value={o.font}
            onChange={(e) => onOptions({ font: e.target.value as FontFamily })}
            className="h-8 rounded-lg border border-stone-300 bg-white px-2"
          >
            <option value="Helvetica">Sans</option>
            <option value="Times">Serif</option>
            <option value="Courier">Mono</option>
          </select>
          <label className="flex items-center gap-1 text-stone-600">
            Size
            <input
              type="number"
              min={4}
              max={144}
              value={o.size}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v >= 4 && v <= 144) onOptions({ size: v });
              }}
              className="h-8 w-16 rounded-lg border border-stone-300 bg-white px-2"
            />
          </label>
          <button
            type="button"
            aria-pressed={o.bold}
            onClick={() => onOptions({ bold: !o.bold })}
            className={`h-8 w-8 shrink-0 rounded-lg border font-bold ${o.bold ? 'border-brand-700 bg-brand-800 text-white' : 'border-stone-300 bg-white text-stone-700'}`}
            title="Bold"
          >
            B
          </button>
          <Swatches colors={COLORS} value={o.textColor} onPick={(c) => onOptions({ textColor: c })} label="Text colour" />
        </>
      )}
      {kind === 'stroke' && (
        <>
          <Swatches colors={COLORS} value={o.strokeColor} onPick={(c) => onOptions({ strokeColor: c })} label="Colour" />
          {selected?.type !== 'check' && tool !== 'check' && (
            <label className="flex shrink-0 items-center gap-2 text-stone-600">
              Thickness
              <input
                type="range"
                min={1}
                max={16}
                step={0.5}
                value={o.strokeWidth}
                onChange={(e) => onOptions({ strokeWidth: Number(e.target.value) })}
                className="w-24 accent-brand-700"
              />
              <span className="w-8 tabular-nums">{o.strokeWidth}</span>
            </label>
          )}
        </>
      )}
      {kind === 'highlight' && (
        <Swatches colors={HIGHLIGHTS} value={o.highlightColor} onPick={(c) => onOptions({ highlightColor: c })} label="Highlight colour" />
      )}
      {kind === 'whiteout' && (
        <p className="text-stone-600">Drag over text to cover it, then use <strong>Text</strong> to type on top.</p>
      )}
      {!selected && (tool === 'draw' || tool === 'rect' || tool === 'line' || tool === 'arrow' || tool === 'highlight') && (
        <p className="hidden text-stone-500 lg:block">Drag on the page.</p>
      )}
      {!selected && (tool === 'text' || tool === 'date' || tool === 'check') && (
        <p className="hidden text-stone-500 lg:block">Click on the page to place it.</p>
      )}
    </div>
  );
}
