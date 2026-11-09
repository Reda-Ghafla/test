import { useEffect, useRef, useState } from 'react';

/** True while the element is within `rootMargin` of the scroll viewport. */
export function useInView<T extends Element>(rootMargin = '800px') {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);
  return { ref, inView };
}
