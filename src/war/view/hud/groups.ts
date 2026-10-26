/**
 * W-53 control groups on the HUD (../select.ts keeps them):
 *
 *   over the command card   the group bar: 1-9, each with its main class icon and how many men; click (or the digit)
 *                           selects it, a second click centres on it, Ctrl+click (Ctrl+digit) stores the selection;
 *                           lit while the selection is that group; empty groups greyed
 *   on the map              the group number by the feet of each grouped man of yours (sprite zoom)
 */
import Phaser from 'phaser';
import type { SandboxScene } from '../SandboxScene';
import { icon, UNIT_ICON } from './kit';
import { SPRITE_ZOOM } from '../units';

type Mk = (id: string, css: string, html?: string) => HTMLElement;
type TipOn = (el: HTMLElement, html: () => string) => void;
const CLASS = (c: string) => c.replace(/^civ_/, '').replace(/_/g, ' ');

export const GROUPS_CSS = `
#rfGroups .rf-btn .cnt{position:absolute;left:2px;top:1px;font:700 9px/1 Inter,sans-serif;color:var(--rf-gold);text-shadow:0 1px 0 #0e0907,0 0 2px #0e0907}
#rfGroups .rf-btn:disabled .key{opacity:.55}`;

export function mountGroups(s: SandboxScene, mk: Mk, tipOn: TipOn): { refresh(bottom: number, show: boolean): void } {
  const bar = mk('rfGroups', 'left:50%;transform:translateX(-50%);display:none;gap:2px;pointer-events:auto');
  const btns = Array.from({ length: 9 }, (_, i) => {
    const n = i + 1, b = document.createElement('button');
    b.className = 'rf-btn';
    b.id = 'grp' + n;
    b.innerHTML = `${icon('unit-militia')}<span class="cnt"></span><span class="key">${n}</span>`;
    b.onclick = (e) => { if (e.ctrlKey || e.metaKey) s.sel.store(n); else s.sel.recall(n, performance.now()); };
    tipOn(b, () => {
      const men = (s.sel.groups.get(n) ?? []).map((id) => s.drawn.find((d) => d.u.id === id)).filter((d) => !!d);
      const by = new Map<string, number>();
      for (const d of men) by.set(d.u.cls, (by.get(d.u.cls) ?? 0) + 1);
      const what = men.length ? [...by].map(([c, k]) => `${k} ${CLASS(c)}`).join(', ') : 'empty';
      return `<div class="rf-name" style="margin-bottom:3px">Group ${n}</div>${what}<div class="rf-dim" style="margin-top:3px">click or <b class="k">${n}</b> selects, again centres the view · <b class="k">Ctrl+${n}</b> stores the selection</div>`;
    });
    return b;
  });
  bar.append(...btns);
  const draw = () => {
    const sel = s.sel;
    btns.forEach((b, i) => {
      const ids = sel.groups.get(i + 1) ?? [];
      const men = ids.map((id) => s.drawn.find((d) => d.u.id === id)).filter((d) => !!d);
      const by = new Map<string, number>();
      for (const d of men) by.set(d.u.cls, (by.get(d.u.cls) ?? 0) + 1);
      const top = [...by].sort((a, c) => c[1] - a[1])[0]?.[0];
      const ic = top ? UNIT_ICON[top] ?? 'unit-militia' : 'unit-militia';
      if (b.dataset.ic !== ic) { b.dataset.ic = ic; b.querySelector('.ic')!.outerHTML = icon(ic); }
      b.querySelector<HTMLElement>('.cnt')!.textContent = men.length ? String(men.length) : '';
      b.disabled = !men.length;
      b.classList.toggle('on', men.length > 0 && men.length === sel.units.size && ids.every((id) => sel.units.has(id)));
    });
  };

  // the group numbers on the map, by the feet of each grouped man (pooled texts, one screen size at any zoom)
  const texts: Phaser.GameObjects.Text[] = [];
  s.events.on('postupdate', () => {
    let k = 0;
    const z = s.cameras.main.zoom;
    if (z >= SPRITE_ZOOM && s.sel.groups.size) {
      for (const d of s.drawn) {
        if (d.team !== 0 || d.u.state === 'dead') continue;
        const n = s.sel.groupOf(d.u.id);
        if (!n) continue;
        const t = texts[k] ?? texts[texts.push(s.add.text(0, 0, '', { fontFamily: 'Inter, sans-serif', fontStyle: '700', fontSize: '20px', color: '#e0b867', stroke: '#0e0907', strokeThickness: 5 }).setOrigin(0.5, 0.5).setDepth(10.9)) - 1];
        k++;
        const x = s.iso.sx(d.x, d.y), y = s.iso.sy(d.x, d.y, s.iso.zAt(d.x, d.y));
        if (t.text !== String(n)) t.setText(String(n));
        t.setPosition(x + 12 / z, y + 4 / z).setScale(0.5 / z).setVisible(true);
      }
    }
    for (let i = k; i < texts.length; i++) texts[i].setVisible(false);
  });

  return {
    refresh(bottom, show) {
      bar.style.display = show && s.sel.groups.size ? 'flex' : 'none';
      bar.style.bottom = `${bottom}px`;
      if (show) draw();
    },
  };
}
