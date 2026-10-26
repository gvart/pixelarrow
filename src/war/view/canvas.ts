/**
 * A 2D canvas in the page, or an OffscreenCanvas in a worker (./bakeWorker.ts), typed as a page canvas: the art code
 * (./art.ts and what it draws with) paints, reads and draws from both alike.
 */
export function canvas(w: number, h: number): HTMLCanvasElement {
  if (typeof document === 'undefined') return new OffscreenCanvas(w, h) as unknown as HTMLCanvasElement;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
