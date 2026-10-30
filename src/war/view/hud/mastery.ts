/**
 * W-73 the region mastery chip (rules: ../../net/mastery.ts): a small tag in the top bar, right of the region plaque, with
 * the lairs, chiefs and hidden quests of this region the player has done out of all (icon chips); mastered, a gold
 * banner badge. The region mastered: one toast (the roster's note, ./roster/toast.ts, with qcard chips).
 *
 * Online the region server sends his progress (`mastery`, on join and on each deed). Offline the chip keeps it itself
 * from the local sim's snapshot and events (wildDeeds), for this visit. Mounted by ./roster/index.ts (one line).
 */
import type { SandboxScene } from '../SandboxScene';
import type { ServerMsg } from '../../net/protocol';
import { MASTERY, masteryNeed, masteryView, wildDeeds, type MasteryView, type WildKind } from '../../net/mastery';
import type { Note } from './roster/state';
import { glyph } from './glyph';
import { chip } from './qcard';
import { esc } from './roster/ui';

const CSS = `
#rfMastery{position:absolute;top:50%;transform:translateY(-50%);display:flex;gap:4px;align-items:center;pointer-events:auto;white-space:nowrap}
#rfMastery .qc-chip{height:20px;font-size:13px}
#rfMastery .qc-chip.done{color:var(--hud-good)}
#rfMastery .ms-badge{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 7px 0 4px;border-radius:2px;font:700 13px/1 Cinzel,serif;letter-spacing:.06em;color:var(--hud-gold-hi);background:#1c140c;box-shadow:inset 0 0 0 1px var(--hud-gold-lo),0 0 6px rgba(226,189,104,.35)}
`;

const ROWS: [WildKind, keyof Pick<MasteryView, 'lairs' | 'chiefs' | 'secrets'>, string, string][] = [
  ['lair', 'lairs', 'ui:raid', 'Lairs cleared'],
  ['chief', 'chiefs', 'ui:beast', 'Chiefs slain'],
  ['secret', 'secrets', 'ui:eye', 'Hidden quests found and finished'],
];

/**
 * The chip's inner HTML for a view (pure: tests). `compact`: one chip with the sum (a narrow window, where the three
 * would run into the resources), each count in its tooltip.
 */
export function masteryHtml(v: MasteryView, name: string, compact = false): string {
  if (v.done) return `<span class="ms-badge" title="${esc(`You mastered ${name}: every lair, chief and hidden quest`)}">${glyph('ui:banner', 16)}Mastered</span>`;
  if (compact) {
    const rows = ROWS.filter(([, k]) => v[k][1] > 0), have = rows.reduce((a, [, k]) => a + v[k][0], 0), all = rows.reduce((a, [, k]) => a + v[k][1], 0);
    return chip.any(glyph('ui:banner', 16), `${have}/${all}`, '', `Mastery of ${name}: ${rows.map(([, k, , tip]) => `${tip.toLowerCase()} ${v[k][0]}/${v[k][1]}`).join(', ')}`);
  }
  return ROWS.filter(([, k]) => v[k][1] > 0)
    .map(([, k, g, tip]) => chip.any(glyph(g, 16), `${v[k][0]}/${v[k][1]}`, v[k][0] === v[k][1] ? 'done' : '', `${tip} in ${name} (region mastery)`))
    .join('');
}

export function mountMastery(s: SandboxScene, note: (n: Note) => void): void {
  const need = masteryNeed(s.region), name = s.region.name;
  if (!need.lairs.length && !need.chiefs.length && !need.secrets.length) return;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.id = 'rfMastery';
  let v: MasteryView = masteryView(s.region.id, need, []), shown = '';
  const render = () => {
    // in the bar beside the plaque (it clips its own children; under it the toasts and banners come down): right of
    // it, else left of it when the right-hand buttons reach that far, else (narrow windows: it would run into the
    // resources) one chip with the sum
    const plaque = document.querySelector<HTMLElement>('#rfTop .tb-plaque');
    if (!plaque) return;
    if (!el.isConnected) plaque.parentElement?.appendChild(el);
    const half = Math.ceil(plaque.offsetWidth / 2) + 8;
    const edge = (sel: string, side: 'left' | 'right') => {
      const xs = [...document.querySelectorAll<HTMLElement>(sel)].filter((x) => x.offsetWidth > 0).map((x) => x.getBoundingClientRect()[side]);
      return side === 'left' ? Math.min(Infinity, ...xs) : Math.max(-Infinity, ...xs);
    };
    for (const compact of [false, true]) {
      const html = masteryHtml(v, name, compact);
      if (html !== shown) el.innerHTML = shown = html;
      el.style.right = '';
      el.style.left = `calc(50% + ${half}px)`;
      if (el.getBoundingClientRect().right + 6 <= edge('#rfTop .tb-r > *', 'left')) return;
      el.style.left = '';
      el.style.right = `calc(50% + ${half}px)`;
      if (el.getBoundingClientRect().left - 6 >= edge('#rfTop .tb-l > *', 'right')) return;
    }
  };
  const set = (nv: MasteryView) => {
    const won = nv.done && !v.done;
    v = nv;
    render();
    if (won) note({ kind: 'info', text: `${name} mastered`, icon: glyph('ui:banner', 30), chips: chip.any(glyph('ui:star', 16), `+${MASTERY.favour} favour`, 'gold', 'Divine favour') + chip.any(glyph('ui:banner', 16), `Banner of ${name}`, 'gold', 'A deed on your men standing here') });
  };
  // online: the server's word; offline: the local sim's deeds, this visit
  s.sim.serverTaps.add((m: ServerMsg) => {
    if (m.t === 'mastery' && m.region === s.region.id) set(m);
  });
  const seen = new Map<number, string>(), have: { kind: WildKind; key: string }[] = [];
  const prev = s.sim.onEvents;
  s.sim.onEvents = (ev) => {
    prev?.(ev);
    const cur = s.sim.cur;
    if (s.sim.net || !cur) return;
    const got = wildDeeds(cur, ev, seen, 0).filter((d) => d.pid === 0);
    if (got.length) (have.push(...got), set(masteryView(s.region.id, need, have)));
  };
  setInterval(render, 1000); // the top bar may mount after us
  render();
  // scripts (scripts/war, Playwright): show a progress
  (window as unknown as { __mastery: unknown }).__mastery = { set, need };
}
