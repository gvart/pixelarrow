/**
 * W-60 souls on the HUD (docs/WAR.md "Souls"; src/war/sim/souls.ts): the newly dead wait on the map as pale ghosts
 * (../units.ts draws them from this module's source, ./mapDraw.ts marks them on the minimap and full map). With men of
 * yours selected and a soul in sight, a prompt names him (class, level, where he woke, how long until he fades) and its
 * Claim button sends the squad to him (claimSoul), as right click or E on him does (../interact.ts). He joins only while your army is under ARMY_MAX: at 12 the button
 * says so and the claim is refused with a clear note; a claim that goes through, or one the sim or the server refuses,
 * shows as a note too (the roster's toasts).
 */
import { ARMY_MAX } from '../../sim/soldiers';
import { SOUL } from '../../sim/souls';
import type { ServerMsg } from '../../net/protocol';
import type { SoulSnap, WarEvent } from '../../types';
import type { SandboxScene } from '../SandboxScene';
import { setSoulSource } from '../units';
import { myTeam } from '../side';
import { card, fx, val } from './codex';
import { UNIT_ICON } from './kit';
import { sandboxRoster, SandboxRoster } from './roster/state';
import { esc } from './roster/ui';
import { metres } from './explain';

type Mk = (id: string, css: string, html?: string) => HTMLElement;

/** A soul this near the selected men (tiles) gets the prompt. */
const SEE_R = 40;
const SITE: Record<SoulSnap['site'], string> = { shrine: 'at a shrine', ruin: 'in a ruin', battlefield: 'on an old battlefield', lair: 'at a lair' };
const mmss = (ticks: number) => { const s = Math.max(0, Math.ceil(ticks / 10)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** A ghostly class icon: the unit icon greyed, brightened and glowing (no new art). */
export const ghostIcon = (cls: string, px = 24) =>
  `<img src="war/ui/icons/24/${UNIT_ICON[cls] ?? 'unit-militia'}.png" srcset="war/ui/icons/24/${UNIT_ICON[cls] ?? 'unit-militia'}@2x.png 2x" width="${px}" height="${px}" alt="" style="filter:grayscale(1) brightness(1.7) drop-shadow(0 0 3px #9fd4ff) drop-shadow(0 0 6px #9fd4ff);opacity:.85">`;

/** The codex card of a soul. */
export function soulCard(so: SoulSnap, full: boolean): string {
  return card({
    icon: ghostIcon(so.cls, 26), rawIcon: true, name: `Soul of a ${SandboxRoster.className(so.cls).toLowerCase()}`, kind: `level ${so.level} · woke ${SITE[so.site]}`, w: 240,
    flavour: 'He died in the world above and woke here. Claim him before he fades, or before another does.',
    fx: [
      fx('ui:people', full ? `your army is full: ${val(`${ARMY_MAX} / ${ARMY_MAX}`, 'neg')} men, he cannot join` : `joins the squad you send, as a level ${so.level} ${SandboxRoster.className(so.cls).toLowerCase()}`),
      fx('ui:hourglass', `fades in ${val(mmss(so.left), '')}`),
      fx('ui:swords', `foes or beasts beside him take him first; two sides at him: ${val('contested', 'neg')}`),
      fx('ui:clock', `stand by him ${SOUL.channel / 10} s to claim`),
    ],
  });
}

/** His fighters now: online the roster's (every region, as the server counts), offline his men on this map (as the sim does). */
export function armyMen(s: SandboxScene): number {
  if (s.sim.net) return sandboxRoster(s).rows().filter((r) => r.where !== 'dead' && !(r.p.hero.cls ?? '').startsWith('civ_')).length;
  const own = new Set((s.sim.cur?.squads ?? []).filter((q) => q.team === myTeam()).map((q) => q.id));
  return (s.sim.cur?.units ?? []).filter((u) => own.has(u.squad) && u.state !== 'dead' && !u.cls.startsWith('civ_')).length;
}

/** The soul within `r` tiles of tile point (x, y), nearest first (right click and E pick him so). */
export const soulAt = (s: SandboxScene, x: number, y: number, r = 1.5): SoulSnap | null =>
  (s.sim.cur?.souls ?? []).reduce<SoulSnap | null>((a, so) => (Math.hypot(so.x - x, so.y - y) <= r && (!a || Math.hypot(so.x - x, so.y - y) < Math.hypot(a.x - x, a.y - y)) ? so : a), null);

/** Why squad men may not claim now (the army is full), else undefined. */
export const claimWhy = (s: SandboxScene): string | undefined => (armyMen(s) >= ARMY_MAX ? `army full ${ARMY_MAX}/${ARMY_MAX}` : undefined);

/** Send `squad` to claim soul `so` (the prompt's button, right click and E), with the roster's note; refused when the army is full. */
export function claimSoul(s: SandboxScene, squad: number, so: SoulSnap): void {
  const note = (text: string, kind: 'dead' | 'info') => sandboxRoster(s).onNote?.({ kind, text });
  if (claimWhy(s)) return note(`Your army is full (${ARMY_MAX} / ${ARMY_MAX} men): the soul cannot join until a man falls or retires`, 'dead');
  s.sim.order({ kind: 'claimSoul', squad, soul: so.id });
  note(`Your men go to claim the soul of a ${SandboxRoster.className(so.cls).toLowerCase()}`, 'info');
}

export function mountSouls(s: SandboxScene, mk: Mk, tipOn: (el: HTMLElement, html: () => string) => void): void {
  setSoulSource(() => s.sim.cur?.souls ?? []);
  const R = sandboxRoster(s);
  const note = (text: string, kind: 'levelUp' | 'dead' | 'info' = 'info') => R.onNote?.({ kind, text });
  const el = mk('rfSoul', 'left:50%;bottom:132px;transform:translateX(-50%);display:none;pointer-events:auto');
  el.className = 'rf rf-card';
  el.style.padding = '5px 8px';
  let soul: SoulSnap | null = null;
  tipOn(el, () => (soul ? soulCard(soul, armyFull()) : ''));

  const armyFull = () => !!claimWhy(s);

  /** The soul nearest the selected squads' centre within SEE_R, and the squad to send. */
  const pick = (): { so: SoulSnap; squad: number; d: number } | null => {
    const qs = s.siege.own(), cur = s.sim.cur;
    if (!qs.length || !cur?.souls?.length) return null;
    const men = cur.units.filter((u) => qs.includes(u.squad) && u.state !== 'dead');
    if (!men.length) return null;
    const cx = men.reduce((a, u) => a + u.x, 0) / men.length, cy = men.reduce((a, u) => a + u.y, 0) / men.length;
    let best: { so: SoulSnap; squad: number; d: number } | null = null;
    for (const so of cur.souls) {
      const d = Math.hypot(so.x - cx, so.y - cy);
      if (d <= SEE_R && (!best || d < best.d)) best = { so, squad: qs[0], d };
    }
    return best;
  };

  let last = '';
  const render = () => {
    const p = pick();
    soul = p?.so ?? null;
    el.style.display = p ? '' : 'none';
    if (!p) return void (last = '');
    const so = p.so, mine = so.claim !== undefined && so.team === myTeam();
    // W-68: a named soul (a released captive, a dismissed man) by name; one this player dismissed is not his to claim for a while
    const owner = s.sim.cur?.squads.find((q) => q.id === p.squad)?.owner, tick = s.sim.cur?.tick ?? 0;
    const barred = !!so.bar && so.bar.owner === owner && tick < so.bar.at, full = armyFull() || barred;
    const state = so.contested ? '<span style="color:var(--rf-bad)">contested</span>' : mine ? `<span style="color:var(--rf-gold)">claiming ${Math.round((so.claim ?? 0) * 100)}%</span>` : `<span class="rf-dim">${metres(p.d)} · fades ${mmss(so.left)}</span>`;
    const html = `<div style="display:flex;align-items:center;gap:7px">${ghostIcon(so.cls, 24)}<div style="min-width:0"><div class="rf-name" style="font-size:13px">Soul · ${so.name ? `${esc(so.name)}, ` : ''}${esc(SandboxRoster.className(so.cls))} <span class="rf-lv">L${so.level}</span></div><div style="font-size:12px">${state}</div></div>
      <button class="rf-tbtn${full ? '' : ' pri'}" data-act="claim" ${full ? 'data-full="1"' : ''} style="margin-left:6px">${barred ? `Yours in ${mmss(so.bar!.at - tick)}` : full ? `Army full ${ARMY_MAX}/${ARMY_MAX}` : 'Claim'}</button></div>`;
    if (html !== last) el.innerHTML = last = html;
  };
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act="claim"]');
    const p = pick();
    if (b && p) claimSoul(s, p.squad, p.so);
  });

  // what became of a claim: the sim's events (local play) and the region server's notes (online)
  const ownSquad = (q: number) => s.sim.cur?.squads.find((x) => x.id === q)?.team === myTeam();
  /** Each outcome told once (the hooks below may sit twice in a chain of handlers). */
  const told = new Set<string>();
  const once = (k: string) => !told.has(k) && !!told.add(k);
  const onEvents = (ev: WarEvent[]) => {
    for (const e of ev) {
      if ((e.kind === 'soulClaimed' || e.kind === 'soulRefused') && !once(`${e.kind}:${e.soul}:${e.t}`)) continue;
      if (e.kind === 'soulClaimed' && ownSquad(e.squad)) note(`${e.person.hero.name}, a level ${e.person.hero.level} ${SandboxRoster.className(e.person.hero.cls).toLowerCase()}, joins your squad`, 'levelUp');
      else if (e.kind === 'soulRefused' && ownSquad(e.squad)) note(`Claim refused: your army is full (${e.have} / ${ARMY_MAX} men). A soul joins only when a man falls or retires`, 'dead');
    }
  };
  let seq = 0;
  const onServer = (m: ServerMsg) => {
    if (m.t !== 'soul') return;
    if (!once(`srv:${m.state}:${m.soul}:${m.state === 'refused' ? seq++ : ''}`)) return;
    if (m.state === 'claimed') note(`${m.name ?? 'A new man'}, a level ${m.level ?? 1} ${SandboxRoster.className(m.cls).toLowerCase()}, joins your squad`, 'levelUp');
    else note(`Claim refused: your army is full (${m.have ?? ARMY_MAX} / ${ARMY_MAX} men across all regions). A soul joins only when a man falls or retires`, 'dead');
  };
  // chain onto the sim client's single hooks (the roster and the market hold them too); re-chain if one is set anew
  let ev: typeof s.sim.onEvents = null, sv: typeof s.sim.onServer = null;
  const hook = () => {
    if (s.sim.onEvents !== ev) {
      const prev = s.sim.onEvents;
      s.sim.onEvents = ev = (x) => (prev?.(x), onEvents(x));
    }
    if (s.sim.onServer !== sv) {
      const prev = s.sim.onServer;
      s.sim.onServer = sv = (m) => (m.t === 'soul' ? onServer(m) : prev?.(m));
    }
  };
  hook();
  setInterval(() => (hook(), render()), 250);
}
