/**
 * Small notices under the resource band (M5g): a soldier levelled up, was taken captive, fell. At most four, each
 * fades after a few seconds; a click opens the soldier's card.
 */
import { icon } from '../kit';
import type { Note } from './state';
import { esc } from './ui';

const ICON: Record<Note['kind'], string> = { levelUp: 'act-upgrade', capture: 'act-hold', dead: 'act-cancel', info: 'act-assign' };
const COLOR: Record<Note['kind'], string> = { levelUp: 'var(--rf-gold)', capture: 'var(--rf-bad)', dead: 'var(--rf-bad)', info: 'var(--rf-ink)' };
const LIFE = 4500, MAX = 4;

export function toaster(box: HTMLElement, open: (pid: string) => void): (n: Note) => void {
  return (n) => {
    const t = document.createElement('div');
    t.className = 'rf-label rr-toast';
    t.style.pointerEvents = 'auto';
    t.style.cursor = n.pid ? 'pointer' : 'default';
    t.innerHTML = `${icon(ICON[n.kind])}<span style="color:${COLOR[n.kind]}">${esc(n.text)}</span>`;
    if (n.pid) t.onclick = () => open(n.pid!);
    box.appendChild(t);
    while (box.children.length > MAX) box.firstElementChild!.remove();
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(-4px)'; }, LIFE);
    setTimeout(() => t.remove(), LIFE + 450);
  };
}
