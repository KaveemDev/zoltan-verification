import { useEffect, useRef, useState } from 'react';
// Legacy build: supports older Android WebViews and iOS Safari versions.
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { copy } from '../copy';

GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Renders every page to a canvas and reports which pages the reader has scrolled past.
 * shortcut: renders all pages up front; fine for 1–5 page agreements, render lazily if they get long.
 */
export function PdfViewer({
  url,
  onProgress,
  onError,
}: {
  url: string;
  onProgress: (seen: number, total: number) => void;
  onError: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [total, setTotal] = useState(0);
  const onProgressRef = useRef(onProgress);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onProgressRef.current = onProgress;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    const container = containerRef.current!;
    const seen = new Set<number>();
    let cancelled = false;
    let observer: IntersectionObserver | undefined;
    const task = getDocument({ url });

    (async () => {
      const pdf = await task.promise;
      if (cancelled) return;
      setTotal(pdf.numPages);
      onProgressRef.current(0, pdf.numPages);
      observer = new IntersectionObserver((entries) => {
        for (const e of entries)
          if (e.isIntersecting) seen.add(Number((e.target as HTMLElement).dataset.page));
        onProgressRef.current(seen.size, pdf.numPages);
      });

      const width = container.clientWidth;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (let n = 1; n <= pdf.numPages && !cancelled; n++) {
        const page = await pdf.getPage(n);
        const viewport = page.getViewport({
          scale: (width / page.getViewport({ scale: 1 }).width) * dpr,
        });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.className = 'block w-full bg-white shadow';
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `Page ${n} of ${pdf.numPages}`);
        // A page counts as read once its bottom edge has been on screen.
        const sentinel = document.createElement('div');
        sentinel.dataset.page = String(n);
        sentinel.className = 'h-px';
        const wrap = document.createElement('div');
        wrap.className = 'mb-3';
        wrap.append(canvas, sentinel);
        container.append(wrap);
        await page.render({ canvas, viewport }).promise;
        observer.observe(sentinel);
      }
    })().catch(() => !cancelled && onErrorRef.current());

    return () => {
      cancelled = true;
      observer?.disconnect();
      task.destroy();
      container.replaceChildren();
    };
  }, [url]);

  return (
    <div>
      <div ref={containerRef} className="rounded-lg bg-slate-200 p-2" />
      {total === 0 && <p className="p-4 text-center text-slate-600">{copy.common.loading}</p>}
    </div>
  );
}
