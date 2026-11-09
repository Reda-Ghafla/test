import { CHECK_POINTS, FONT_CSS, LINE_HEIGHT, lineGeometry, strokePath, type EditObj } from '../lib/objects';

/**
 * Draws an object's content in its own (unrotated) frame of cw × ch points,
 * scaled by `zoom`. Kept visually identical to what exportPdf.ts writes.
 */
export function ObjectContent({ o, cw, ch, zoom }: { o: EditObj; cw: number; ch: number; zoom: number }) {
  const W = cw * zoom;
  const H = ch * zoom;
  const svg = (children: React.ReactNode) => (
    <svg width={W} height={H} viewBox={`0 0 ${cw} ${ch}`} preserveAspectRatio="none" className="block overflow-visible">
      {children}
    </svg>
  );

  switch (o.type) {
    case 'text':
      return (
        <div
          className="pointer-events-none select-none whitespace-pre"
          style={{
            fontFamily: FONT_CSS[o.font],
            fontSize: o.size * zoom,
            lineHeight: LINE_HEIGHT,
            fontWeight: o.bold ? 700 : 400,
            color: o.color,
          }}
        >
          {o.text || ' '}
        </div>
      );
    case 'whiteout':
      return <div className="h-full w-full bg-white" />;
    case 'highlight':
      return <div className="h-full w-full mix-blend-multiply" style={{ background: o.color, opacity: 0.4 }} />;
    case 'rect':
      return svg(
        <rect
          x={o.stroke / 2}
          y={o.stroke / 2}
          width={Math.max(cw - o.stroke, 0)}
          height={Math.max(ch - o.stroke, 0)}
          fill="none"
          stroke={o.color}
          strokeWidth={o.stroke}
        />,
      );
    case 'line':
    case 'arrow': {
      const { shaft, head } = lineGeometry(o, cw, ch);
      return svg(
        <>
          <path d={shaft} stroke={o.color} strokeWidth={o.stroke} strokeLinecap="round" fill="none" />
          {head && <path d={head} fill={o.color} stroke={o.color} strokeWidth={1} strokeLinejoin="round" />}
        </>,
      );
    }
    case 'draw':
      return svg(
        <path
          d={strokePath(o.pts, cw / o.vw, ch / o.vh)}
          stroke={o.color}
          strokeWidth={o.stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />,
      );
    case 'check': {
      const p = CHECK_POINTS.map((v, i) => (i % 2 ? (v * ch) / 24 : (v * cw) / 24));
      return svg(
        <polyline
          points={p.join(' ')}
          stroke={o.color}
          strokeWidth={Math.min(cw, ch) * 0.12}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />,
      );
    }
    case 'image':
      return <img src={o.src} alt="" draggable={false} className="pointer-events-none block h-full w-full select-none" />;
  }
}
