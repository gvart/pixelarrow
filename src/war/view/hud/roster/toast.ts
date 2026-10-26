/**
 * Small notices at the top centre (M5g): a soldier levelled up, was taken captive, fell. At most four, each fades after
 * a few seconds; a click opens the soldier's card. They never cover that card: when it stands under them they move to
 * its right (placeToasts).
 */
import { icon } from '../kit';
import type { Note } from './state';
import { esc } from './ui';

const ICON: Record<Note['kind'], string> = { levelUp: 'act-upgrade', capture: 'act-hold', dead: 'act-cancel', info: 'act-assign' };
const COLOR: Record<Note['kind'], string> = { levelUp: 'var(--rf-gold)', capture: 'var(--rf-bad)', dead: 'var(--rf-bad)', info: 'var(--rf-ink)' };
const LIFE = 4500, MAX = 4;

/** Centre the toasts at the top, or, when that covers `avoid` (the soldier card, shown and maybe dragged), just right of it. */
export function placeToasts(box: HTMLElement, avoid: HTMLElement): void {
  box.style.left = '50%';
  box.style.transform = 'translateX(-50%)';
  if (avoid.style.display === 'none' || !box.children.length) return;
  const a = avoid.getBoundingClientRect(), b = box.getBoundingClientRect(), z = Number(box.style.zoom) || 1;
  if (b.left < a.right && b.right > a.left && b.top < a.bottom && b.bottom > a.top) {
    box.style.left = `${Math.round((a.right + 8) / z)}px`;
    box.style.transform = 'none';
  }
}

export function toaster(box: HTMLElement, open: (pid: string) => void, place: () => void = () => {}): (n: Note) => void {
  return (n) => {
    const t = document.createElement('div');
    t.className = 'rf-label rr-toast';
    t.style.pointerEvents = 'auto';
    t.style.cursor = n.pid ? 'pointer' : 'default';
    t.innerHTML = `${icon(ICON[n.kind])}<span style="color:${COLOR[n.kind]}">${esc(n.text)}</span>`;
    if (n.pid) t.onclick = () => open(n.pid!);
    box.appendChild(t);
    while (box.children.length > MAX) box.firstElementChild!.remove();
    place();
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(-4px)'; }, LIFE);
    setTimeout(() => t.remove(), LIFE + 450);
  };
}
