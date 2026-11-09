import { useCallback, useEffect, useState } from 'react';
import { Landing } from './components/Landing';
import { Editor } from './components/Editor';
import { loadPdf } from './lib/pdfjs';
import { uid } from './lib/id';
import type { EditorDoc, SourceDoc } from './lib/types';

export default function App() {
  const [doc, setDoc] = useState<EditorDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openFile = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdf = await loadPdf(bytes);
      const source: SourceDoc = { id: uid('src'), name: file.name, bytes, pdf };
      setDoc({
        fileName: file.name,
        sources: { [source.id]: source },
        pages: Array.from({ length: pdf.numPages }, (_, i) => ({
          id: uid('page'),
          sourceId: source.id,
          sourceIndex: i,
          rotation: 0,
        })),
      });
    } catch (err) {
      console.error(err);
      const name = (err as { name?: string })?.name;
      setError(
        name === 'PasswordException'
          ? 'This PDF is password-protected and can’t be opened yet.'
          : 'Sorry, we couldn’t read that PDF. It may be damaged.',
      );
    } finally {
      setBusy(false);
    }
  }, []);

  // Everything lives in memory: warn before a refresh or tab close loses it.
  useEffect(() => {
    if (!doc) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [doc]);

  const close = useCallback(() => {
    if (!window.confirm('Close this document? Any unsaved changes will be lost.')) return;
    Object.values(doc?.sources ?? {}).forEach((s) => void s.pdf.loadingTask.destroy());
    setDoc(null);
  }, [doc]);

  return doc ? <Editor doc={doc} onClose={close} /> : <Landing onFile={openFile} busy={busy} error={error} />;
}
