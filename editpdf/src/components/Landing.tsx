import { Logo } from './Logo';
import { UploadZone } from './UploadZone';

interface Props {
  onFile: (file: File) => void;
  busy: boolean;
  error: string | null;
}

const features = [
  { title: 'Type & sign', body: 'Add text, draw or type a signature, stamp dates and checkmarks.' },
  { title: 'Mark up', body: 'Highlight, white-out, draw freehand, and add shapes or images.' },
  { title: 'Rearrange', body: 'Rotate, delete, reorder and merge pages in a few taps.' },
];

export function Landing({ onFile, busy, error }: Props) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo className="text-xl text-brand-900" />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-4 pb-16 pt-6 sm:px-6 sm:pt-12">
        <h1 className="text-center text-3xl font-bold tracking-tight text-brand-900 sm:text-5xl">
          Edit any PDF, <span className="text-accent-500">right here</span>.
        </h1>
        <p className="mt-4 max-w-xl text-center text-base text-stone-600 sm:text-lg">
          Fill, sign, annotate and reorganise documents without installing anything.
        </p>

        <div className="mt-10 w-full">
          <UploadZone onFile={onFile} busy={busy} error={error} />
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-800 ring-1 ring-brand-200">
          <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          <p>
            <strong>Your files stay private.</strong> Everything happens inside your browser — your PDF is
            never uploaded to a server.
          </p>
        </div>

        <ul className="mt-14 grid w-full gap-4 sm:grid-cols-3">
          {features.map((f) => (
            <li key={f.title} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
              <h2 className="font-semibold text-brand-800">{f.title}</h2>
              <p className="mt-1 text-sm text-stone-600">{f.body}</p>
            </li>
          ))}
        </ul>
      </main>

      <footer className="py-6 text-center text-xs text-stone-400">EditPDF · runs entirely on your device</footer>
    </div>
  );
}
