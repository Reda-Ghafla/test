import { useCallback, useRef, useState } from 'react';
import { validatePdfFile as validate } from '../lib/sources';

interface Props {
  onFile: (file: File) => void;
  busy?: boolean;
  error?: string | null;
}

export function UploadZone({ onFile, busy, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handle = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      const problem = validate(file);
      setLocalError(problem);
      if (!problem) onFile(file);
    },
    [onFile],
  );

  const shownError = localError ?? error;

  return (
    <div className="w-full">
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handle(e.dataTransfer.files);
        }}
        className={`group flex w-full flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed px-6 py-14 text-center transition
          ${dragging ? 'border-accent-500 bg-accent-400/10' : 'border-brand-200 bg-white hover:border-brand-500 hover:bg-brand-50'}
          ${busy ? 'cursor-wait opacity-70' : 'cursor-pointer'}`}
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-800 text-white shadow-lg shadow-brand-800/20 transition group-hover:scale-105">
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 16V4" />
            <path d="m6 10 6-6 6 6" />
            <path d="M4 20h16" />
          </svg>
        </span>
        <span className="text-lg font-semibold text-stone-800">
          {busy ? 'Opening your PDF…' : dragging ? 'Drop it here' : 'Drop a PDF here, or tap to choose'}
        </span>
        <span className="text-sm text-stone-500">PDF files only · up to 50 MB</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = '';
        }}
      />
      {shownError && (
        <p role="alert" className="mt-3 text-center text-sm font-medium text-red-600">
          {shownError}
        </p>
      )}
    </div>
  );
}
