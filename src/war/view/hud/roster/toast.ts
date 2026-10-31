/**
 * Small notices at the top centre (M5g): a soldier levelled up, was taken captive, fell. At most four, each fades after
 * a few seconds; a click opens the soldier's card. The HUD layout keeps them clear of that card (../layout.ts).
 */
import { icon } from '../kit';
import { chip } from '../qcard';
import type { Note } from './state';
import { esc } from './ui';

const ICON: Record<Note['kind'], string> = { levelUp: 'act-upgrade', capture: 'act-hold', dead: 'act-cancel', info: 'act-assign' };
const COLOR: Record<Note['kind'], string> = { levelUp: 'var(--rf-gold)', capture: 'var(--rf-bad)', dead: 'var(--rf-bad)', info: 'var(--rf-ink)' };
const LIFE = 4500, MAX = 4;

/** Tells a notice; `drop(key)` ends the keyed one early (a raid's warning once the raid is over). */
export type Toaster = ((n: Note) => void) & { drop: (key: string) => void };

export function toaster(box: HTMLElement, open: (pid: string) => void, place: () => void = () => {}): Toaster {
  const keyed = new Map<string, () => void>();
  const drop = (key: string) => keyed.get(key)?.();
  const tell = (n: Note) => {
    if (n.key) drop(n.key);
    const t = document.createElement('div');
    t.className = 'rf-label rr-toast';
    t.style.pointerEvents = 'auto';
    t.style.cursor = n.pid ? 'pointer' : 'default';
    // a quest notice (../qcard.ts): its own verb icon, the short goal, then its chips
    // a warning with a deadline counts it down in its timer chip and stays till then
    const life = n.for ?? LIFE, end = performance.now() + life;
    const left = () => `${Math.max(0, Math.ceil((end - performance.now()) / 1000))} s`;
    const timer = n.for ? chip.time(left(), 'bad rr-left', 'Time left') : '';
    t.innerHTML = `${n.icon ?? icon(ICON[n.kind])}<span class="rr-tt" style="color:${COLOR[n.kind]}">${esc(n.text)}</span>${n.chips ?? ''}${timer}${n.act ? `<button class="rf-tbtn pri rr-act">${esc(n.act.label)}</button>` : ''}`;
    if (n.pid) t.onclick = () => open(n.pid!);
    if (n.act) t.querySelector<HTMLElement>('.rr-act')!.onclick = (e) => { e.stopPropagation(); n.act!.run(); };
    box.appendChild(t);
    while (box.children.length > MAX) box.firstElementChild!.remove();
    place();
    const tick = n.for ? setInterval(() => { const c = t.querySelector('.rr-left span'); if (c) c.textContent = left(); }, 500) : 0;
    let fade: ReturnType<typeof setTimeout> | undefined, gone: ReturnType<typeof setTimeout> | undefined;
    const close = (after: number) => {
      clearTimeout(fade);
      clearTimeout(gone);
      fade = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(-4px)'; }, after);
      gone = setTimeout(() => {
        clearInterval(tick);
        t.remove();
        if (n.key && keyed.get(n.key) === stop) keyed.delete(n.key);
      }, after + 450);
    };
    const stop = () => { clearInterval(tick); close(0); };
    if (n.key) keyed.set(n.key, stop);
    close(life);
  };
  return Object.assign(tell, { drop });
}
