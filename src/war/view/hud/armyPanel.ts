/**
 * The command panel's army state (bottom centre, ./hud.ts): with nothing selected the panel shows his army instead of
 * leaving the bottom empty. Men of ARMY_MAX across all regions (the roster: the wounded count, W-68 captives do not),
 * how many stand here; a click (or the
 * select-all key) selects the men here; none here: where they are; with no man who can fight the Tunnel of Shades countdown
 * (the clock of ./tunnel.ts, never a second one).
 */
import { clock, TUNNEL } from '../../sim/tunnel';
import { keys } from '../../input/keys';
import type { SandboxScene } from '../SandboxScene';
import { myTeam } from '../side';
import { icon } from './kit';
import { sandboxRoster } from './roster/state';
import { tunnelHost } from './tunnel';

export interface ArmyView {
  /** His fighters alive across all regions, of max. */
  men: number; max: number;
  /** His fighters on this map. */
  here: number;
  /** Elsewhere: region name and men there. */
  away: [string, number][];
  /** The tunnel with no man who can fight (null: not wiped): men who can fight, the next rise and the clock now. */
  wipe: { alive: number; nextAt: number | null; now: number } | null;
  /** The select-all key's label. */
  key: string;
}

/** What the panel says: the count line, the line under it and its tone, and whether a click selects the men here. */
export function armyText(v: ArmyView): { count: string; line: string; tone: 'gold' | 'dim'; pick: boolean } {
  // over the cap (a sandbox scenario, men from souls past it): the count alone, not "41 / 12"
  const count = `<b>${v.men}</b>${v.men > v.max ? '' : ` / ${v.max}`} men · <b>${v.here}</b> here`;
  if (v.wipe) return { count, line: `Next man rises in ${v.wipe.nextAt === null ? '…' : clock(v.wipe.nextAt - v.wipe.now)} · ${v.wipe.alive}/${TUNNEL.floor}`, tone: 'gold', pick: false };
  if (v.here) return { count, line: `Click${v.key ? ` or ${v.key}` : ''}: select the ${v.here} here`, tone: 'dim', pick: true };
  const away = v.away.map(([r, n]) => `${n} in ${r}`).join(', ');
  return { count, line: away ? `No men here · ${away}` : 'No men here', tone: 'dim', pick: false };
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
  el.innerHTML = `<div class="hud-port">${icon('unit-hoplite', 32)}</div><div class="ar-t"><div class="rf-name" style="font:700 14px/1.15 Cinzel,serif">Your army</div><div class="ar-c"></div><div class="bk-stat"></div></div>`;
  card.append(el);
  const cnt = el.querySelector<HTMLElement>('.ar-c')!, stat = el.querySelector<HTMLElement>('.bk-stat')!;

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
      const away = new Map<string, number>();
      for (const r of R.rows()) if (r.where === 'away' && !(r.p.hero.cls ?? '').startsWith('civ_')) away.set(r.region, (away.get(r.region) ?? 0) + 1);
      const t = tunnelHost(s), wiped = !!t && t.ever && t.alive === 0 && t.pending > 0;
      const v = armyText({ ...R.army(), here: mineHere().length, away: [...away], wipe: wiped ? { alive: t.alive, nextAt: t.nextAt, now: t.now() } : null, key: keys.label('sel.all') });
      pick = v.pick;
      el.classList.toggle('pick', pick);
      if (cnt.innerHTML !== v.count) cnt.innerHTML = v.count;
      stat.className = `bk-stat ${v.tone === 'gold' ? 'gold' : ''}`;
      stat.textContent = v.line;
    },
  };
}
