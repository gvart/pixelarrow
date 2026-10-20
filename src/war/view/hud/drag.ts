/**
 * Draggable HUD windows (owner play-test): a panel moves by its title plate (`handle`, not its buttons), stays inside
 * the window, remembers where it was put (localStorage per panel id; blocked storage: this session only), and a
 * double click on the title puts it back where the HUD places it. A moved panel carries `data-moved`, so the code
 * that places it (beside the card, under the band) leaves it be.
 */
const KEY = 'war.panel.';
/** The panel moved last sits over the others (still under the tooltips, z 6-7). */
let front: HTMLElement | null = null;

export function draggable(el: HTMLElement, handle = '.rf-head'): void {
  const base = { left: el.style.left, top: el.style.top, right: el.style.right, bottom: el.style.bottom, transform: el.style.transform };
  let at: { x: number; y: number } | null = null;
  try { at = JSON.parse(localStorage.getItem(KEY + el.id) ?? 'null'); } catch { /* storage blocked */ }

  /** Put the top-left corner at viewport px (x, y), inside the window. */
  const place = (x: number, y: number) => {
    const z = Number(el.style.zoom) || 1, r = el.getBoundingClientRect();
    x = Math.max(0, Math.min(innerWidth - r.width, x));
    y = Math.max(0, Math.min(innerHeight - Math.min(r.height, innerHeight), y));
    Object.assign(el.style, { left: `${x / z}px`, top: `${y / z}px`, right: 'auto', bottom: 'auto', transform: 'none' });
    el.dataset.moved = '1';
    at = { x, y };
  };
  const save = () => { try { localStorage.setItem(KEY + el.id, JSON.stringify(at)); } catch { /* this session only */ } };
  if (at) place(at.x, at.y);
  // shown, resized or the window resized: keep it inside
  new ResizeObserver(() => { if (at && el.offsetParent) place(at.x, at.y); }).observe(el);
  addEventListener('resize', () => { if (at) place(at.x, at.y); });

  const onHandle = (e: Event) => {
    const t = e.target as HTMLElement;
    return !!t.closest(handle) && !t.closest('button,input,[data-act],[data-tip]:not(.rf-head)');
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !onHandle(e)) return;
    const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    if (front && front !== el) front.style.zIndex = '';
    (front = el).style.zIndex = '5';
    el.classList.add('rf-dragging');
    const move = (m: PointerEvent) => place(m.clientX - dx, m.clientY - dy);
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); el.classList.remove('rf-dragging'); if (at) save(); };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    e.preventDefault();
  });
  el.addEventListener('dblclick', (e) => {
    if (!onHandle(e)) return;
    at = null;
    try { localStorage.removeItem(KEY + el.id); } catch { /* storage blocked */ }
    Object.assign(el.style, base);
    delete el.dataset.moved;
  });
}
