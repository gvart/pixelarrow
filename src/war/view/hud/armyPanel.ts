/**
 * The command panel's army state (bottom centre, ./hud.ts): with nothing selected the panel shows his men instead of leaving
 * the bottom empty. W-87: they are in one place, so: how many of his path's cap (the wounded count, W-68 captives do not),
 * how many wait at home (W-98), a click (or the select-all key) selects those here; none here: where the group is or the road
 * it is on; with no man who can fight the Tunnel of Shades countdown (the clock of ./tunnel.ts, never a second one).
 */
import { clock } from '../../sim/tunnel';
import { keys } from '../../input/keys';
import type { SandboxScene } from '../SandboxScene';
import { myTeam } from '../side';
import { icon } from './kit';
import { sandboxRoster } from './roster/state';
import { tunnelHost } from './tunnel';
import { armyMen } from './souls';

export interface ArmyView {
  /** His fighters alive, of max. */
  men: number; max: number;
  /** His fighters on this map. */
  here: number;
  /** W-98: men waiting at home, off the field, while the group is away. */
  waiting: number;
  /** The group, when it is not here: the region it stands in, or the one it is on the road to. */
  group: { region: string; road: boolean } | null;
  /** The tunnel with no man who can fight (null: not wiped): men who can fight, the next rise and the clock now. */
  wipe: { alive: number; floor: number; nextAt: number | null; now: number } | null;
  /** The select-all key's label. */
  key: string;
  /** What the count counts: "fighters" for a path whose workers and crew walk beside them (default "men"). */
  word?: string;
}

/** What the panel says: the count line, the line under it and its tone, and whether a click selects the men here. */
export function armyText(v: ArmyView): { count: string; line: string; tone: 'gold' | 'dim'; pick: boolean } {
  // over the cap (a sandbox scenario, men from souls past it): the count alone, not "41 / 12"
  const count = `<b>${v.men}</b>${v.men > v.max ? '' : ` / ${v.max}`} ${v.word ?? 'men'}${v.waiting ? ` · <b>${v.waiting}</b> at home` : ''}`;
  if (v.wipe) return { count, line: `Next man rises in ${v.wipe.nextAt === null ? '…' : clock(v.wipe.nextAt - v.wipe.now)} · ${v.wipe.alive}/${v.wipe.floor}`, tone: 'gold', pick: false };
  if (v.here) return { count, line: `Click${v.key ? ` or ${v.key}` : ''}: select them`, tone: 'dim', pick: true };
  if (v.group) return { count, line: v.group.road ? `On the road to ${v.group.region}` : `Your men are in ${v.group.region}`, tone: 'dim', pick: false };
  return { count, line: 'No men here', tone: 'dim', pick: false };
}

const CSS = `#rfCard #cArmy{cursor:default;align-items:center}#rfCard #cArmy.pick{cursor:pointer}
#rfCard #cArmy .hud-port{width:40px;min-height:40px;display:flex;align-items:center;justify-content:center}
#rfCard #cArmy .ar-t{display:flex;flex-direction:column;justify-content:center;gap:2px;min-width:170px;padding-right:4px}
#rfCard #cArmy .ar-c{font:var(--hud-small);color:var(--hud-muted);white-space:nowrap}#rfCard #cArmy .ar-c b{color:var(--hud-ink)}
#rfCard #cArmy .bk-stat{margin-top:0}`;

/** Mount the army state into the command panel `card` (hidden until refresh(true)). */
export function mountArmyPanel(s: SandboxScene, card: HTMLElement): { refresh(show: boolean): void } {
  const R = sandboxRoster(s);
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.className = 'rf-card hud-cmd';
  el.id = 'cArmy';
  el.style.display = 'none';
  el.innerHTML = `<div class="hud-port">${icon('unit-hoplite', 32)}</div><div class="ar-t"><div class="rf-name" style="font:700 14px/1.15 Cinzel,serif"></div><div class="ar-c"></div><div class="bk-stat"></div></div>`;
  card.append(el);
  const nm = el.querySelector<HTMLElement>('.rf-name')!, cnt = el.querySelector<HTMLElement>('.ar-c')!, stat = el.querySelector<HTMLElement>('.bk-stat')!;

  /** His living fighters on this map (online his own squads, offline his team's, as ./souls.ts armyMen counts). */
  const mineHere = () => {
    const me = `p:${s.sim.playerId}`;
    const sq = new Set((s.sim.cur?.squads ?? []).filter((q) => (s.sim.net ? q.owner === me : q.team === myTeam())).map((q) => q.id));
    return (s.sim.cur?.units ?? []).filter((u) => sq.has(u.squad) && u.state !== 'dead' && !u.cls.startsWith('civ_'));
  };
  let pick = false;
  el.addEventListener('click', () => { if (pick) s.sel.set(mineHere().map((u) => u.id)); });

  return {
    refresh(show) {
      el.style.display = show ? '' : 'none';
      if (!show) return;
      // offline the army is the men on this map, as the sim and the claim prompt count it (./souls.ts armyMen): the local
      // roster also holds men a scenario never sent, who are not anywhere the player can reach
      // online the rest of his group: men on no field here, at rest in one region or on one road (W-87); men at home wait (W-98)
      const rest = s.sim.net ? R.rows().filter((r) => r.where === 'away' && !(r.p.hero.cls ?? '').startsWith('civ_')) : [];
      const home = rest.filter((r) => r.region === R.homeName()), there = rest.find((r) => r.region !== R.homeName() && r.region !== s.region.name);
      const here = mineHere().length, group = here ? null : there ? { region: there.region, road: R.onRoad(there.p.id) } : home.length && s.region.name !== R.homeName() ? { region: R.homeName(), road: false } : null;
      const t = tunnelHost(s), wiped = !!t && t.ever && t.alive === 0 && t.pending > 0;
      const v = armyText({ word: R.way.path && R.way.path !== 'warrior' ? 'fighters' : 'men', ...R.army(), ...(s.sim.net ? {} : { men: armyMen(s) }), here, waiting: here || there ? (s.region.name === R.homeName() ? 0 : home.length) : 0, group, wipe: wiped ? { alive: t.alive, floor: t.floor, nextAt: t.nextAt, now: t.now() } : null, key: keys.label('sel.all') });
      const title = R.way.path === 'warrior' || !R.way.path ? 'Your army' : 'Your men';
      if (nm.textContent !== title) nm.textContent = title;
      pick = v.pick;
      el.classList.toggle('pick', pick);
      if (cnt.innerHTML !== v.count) cnt.innerHTML = v.count;
      stat.className = `bk-stat ${v.tone === 'gold' ? 'gold' : ''}`;
      stat.textContent = v.line;
    },
  };
}
