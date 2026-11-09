import { useEffect, useRef, useState } from 'react';
import '@fontsource/dancing-script/600.css';
import '@fontsource/great-vibes/400.css';
import '@fontsource/caveat/600.css';
import { Icon } from './icons';

export interface Signature {
  src: string;
  /** Natural aspect ratio (width / height). */
  ratio: number;
}

const SCRIPT_FONTS = [
  { family: 'Dancing Script', weight: 600 },
  { family: 'Great Vibes', weight: 400 },
  { family: 'Caveat', weight: 600 },
];
const INKS = ['#111827', '#1e3a8a', '#1d4ed8'];

/** Crop a canvas to its non-transparent pixels and return a PNG. */
function trimToPng(canvas: HTMLCanvasElement, pad = 8): Signature | null {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  if (maxX < 0) return null;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext('2d')!.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return { src: out.toDataURL('image/png'), ratio: out.width / out.height };
}

interface Props {
  onClose: () => void;
  onDone: (sig: Signature) => void;
}

export function SignatureModal({ onClose, onDone }: Props) {
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [ink, setInk] = useState(INKS[0]);
  const [name, setName] = useState('');
  const [font, setFont] = useState(0);
  const [hasInk, setHasInk] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Size the drawing canvas for the screen's pixel density.
  useEffect(() => {
    if (mode !== 'draw') return;
    const c = canvasRef.current!;
    const dpr = Math.max(2, window.devicePixelRatio || 1);
    const r = c.getBoundingClientRect();
    c.width = r.width * dpr;
    c.height = r.height * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setHasInk(false);
  }, [mode]);

  const point = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const draw = (e: React.PointerEvent) => {
    if (!last.current) return;
    const p = point(e);
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    setHasInk(true);
  };

  const clear = () => {
    const c = canvasRef.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  const finish = async () => {
    let sig: Signature | null = null;
    if (mode === 'draw') {
      sig = trimToPng(canvasRef.current!);
    } else if (name.trim()) {
      const f = SCRIPT_FONTS[font];
      const css = `${f.weight} 120px "${f.family}"`;
      await document.fonts.load(css, name);
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d')!;
      ctx.font = css;
      c.width = Math.ceil(ctx.measureText(name).width + 80);
      c.height = 220;
      ctx.font = css;
      ctx.fillStyle = ink;
      ctx.textBaseline = 'middle';
      ctx.fillText(name, 40, 110);
      sig = trimToPng(c);
    }
    if (sig) onDone(sig);
  };

  const canFinish = mode === 'draw' ? hasInk : !!name.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add your signature"
        className="w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-900">Add your signature</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100">
            <Icon name="close" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 rounded-xl bg-stone-100 p-1 text-sm font-medium">
          {(['draw', 'type'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-lg py-2 ${mode === m ? 'bg-white text-brand-800 shadow-sm' : 'text-stone-600'}`}
            >
              {m === 'draw' ? 'Draw' : 'Type'}
            </button>
          ))}
        </div>

        {mode === 'draw' ? (
          <div className="mt-4">
            <div className="relative">
              <canvas
                ref={canvasRef}
                className="h-48 w-full touch-none rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  last.current = point(e);
                  draw(e);
                }}
                onPointerMove={draw}
                onPointerUp={() => (last.current = null)}
                onPointerCancel={() => (last.current = null)}
                aria-label="Signature drawing area"
              />
              {!hasInk && (
                <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-stone-400">
                  Sign here with your mouse or finger
                </p>
              )}
              <div className="pointer-events-none absolute bottom-10 left-6 right-6 border-b border-stone-300" />
            </div>
            <button type="button" onClick={clear} className="mt-2 text-sm font-medium text-stone-500 hover:text-stone-800">
              Clear
            </button>
          </div>
        ) : (
          <div className="mt-4">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Type your name"
              className="h-11 w-full rounded-xl border border-stone-300 px-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
            <div className="mt-3 grid gap-2">
              {SCRIPT_FONTS.map((f, i) => (
                <button
                  key={f.family}
                  type="button"
                  onClick={() => setFont(i)}
                  className={`truncate rounded-xl border-2 px-4 py-2 text-left text-3xl ${font === i ? 'border-brand-600 bg-brand-50' : 'border-stone-200 hover:border-stone-300'}`}
                  style={{ fontFamily: `"${f.family}", cursive`, fontWeight: f.weight, color: ink }}
                >
                  {name || 'Your Name'}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2" role="group" aria-label="Ink colour">
            {INKS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Ink ${c}`}
                onClick={() => setInk(c)}
                className={`h-7 w-7 rounded-full ring-offset-2 ${ink === c ? 'ring-2 ring-brand-600' : 'ring-1 ring-stone-300'}`}
                style={{ background: c }}
              />
            ))}
          </div>
          <button
            type="button"
            disabled={!canFinish}
            onClick={finish}
            className="rounded-xl bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Place signature
          </button>
        </div>
      </div>
    </div>
  );
}
