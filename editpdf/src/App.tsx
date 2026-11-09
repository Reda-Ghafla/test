import { useCallback, useEffect, useState } from 'react';
import { Landing } from './components/Landing';
import { Editor } from './components/Editor';
import { loadSourceFromFile } from './lib/sources';
import type { PageRef, SourceDoc } from './lib/types';

interface OpenDoc {
  key: number;
  fileName: string;
  source: SourceDoc;
  pages: PageRef[];
}

export default function App() {
  const [doc, setDoc] = useState<OpenDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openFile = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const { source, pages } = await loadSourceFromFile(file);
      setDoc({ key: Date.now(), fileName: file.name, source, pages });
    } catch (err) {
      console.error(err);
      const name = (err as { name?: string })?.name;
      setError(
        name === 'PasswordException'
          ? 'This PDF is password-protected and can’t be opened.'
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
    if (!window.confirm('Close this document? Any changes you haven’t downloaded will be lost.')) return;
    setDoc(null);
  }, []);

  return doc ? (
    <Editor key={doc.key} fileName={doc.fileName} initialSource={doc.source} initialPages={doc.pages} onClose={close} />
  ) : (
    <Landing onFile={openFile} busy={busy} error={error} />
  );
}
