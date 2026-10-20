/**
 * The context action (W-30, W-34): E and right click both act on the hovered target for the selected own squads, and a
 * label by the cursor names the recommended action first ("E: <action>"). A quick tap runs it; holding E or the right
 * button for HOLD_MS opens a radial menu of every action for that target (disabled ones greyed with the reason), and
 * releasing over one runs it. By target, first match wins (the recommended action is the first enabled option):
 *
 *   an enemy unit (not while carrying a ladder)        attack its squad; the squad active (./hud/cardActive.ts, greyed while cooling)
 *   own engine                                        burning: extinguish; ours: uncrew (deploy / pack); free and built: crew
 *   enemy engine                                      ignite (torches; not burning yet, squad not driving an engine), else attack; fire arrows
 *   enemy siege ladder on our wall                    push it off
 *   enemy walkway wall or tower, a ladder carried     raise the ladder on that face
 *   enemy building                                    burnable wood not yet alight: ignite (as engines), else attack; fire arrows;
 *                                                     raise ladder (greyed without a carried ladder)
 *   own building                                      burning: extinguish; unfinished: build / resume; hurt: repair (repairBuilding);
 *                                                     M5h3 fortify (Fortifier, paid at once; never the tap's pick):
 *                                                     iron-bind a gate, wet hides on burnable wood
 *   own cart, loot pile, chest, store (M6k)          ./trade/tradeControls.ts: unload, escort, pull, load, pick up, salvage, loot;
 *                                                     an enemy cart: capture first, then ignite / attack
 *   own pre-built ruin (M7g)                          rebuild (a site at RUIN.rebuild of its cost; landmark pieces: restore only)
 *   claim banner (neutral region)                    open: claim the region (channel); locked: move there
 *   resource node                                     gather (guarded by a lair: move there)
 *   walkway, platform or stair top                    move up
 *   ground                                            move
 */
import { BUILDINGS } from '../sim/economy';
import { FORT } from '../sim/works';
import type { BuildingSnap, SquadId, SquadSnap } from '../types';
import { isSite } from './build/buildMode';
import { Radial, RI } from './hud/radial';
import { ACTIVE_UI, activeEffect, activesOf, activeWhy, fireActives } from './hud/cardActive';
import { SIEGE_NAME } from './siege/siegeControls';
import { sandboxCraft } from './hud/craft/state';
import { sandboxRoster } from './hud/roster/state';
import type { SandboxScene } from './SandboxScene';

export interface Action { label: string; run(): void }
/** A radial option: icon id from the kit, and why it is disabled (off). */
export interface Option extends Action { icon: string; off?: string }
type P = { x: number; y: number };
const TEAM = 0;
const LADDER_R = 1.1;
const CLAIM_PICK = 2.5; // tiles round a claim banner's foot
export const HOLD_MS = 200;
const HUB = RI - 4; // art px: releasing inside the hub picks nothing
const nameOf = (b: BuildingSnap) => b.type.replace(/[A-Z]/g, (c) => ' ' + c.toLowerCase());
/** Fire arrows state the sim may add to a squad snapshot (fire-arrows branch). */
type FireSnap = { on: boolean; available: boolean; reason?: string };
const FIRE_WHY: Record<string, string> = { noBrazier: 'needs a lit brazier', noPitch: 'needs pitch' };

export class Interact {
  private el: HTMLDivElement;
  private ring: Radial;
  /** The action the label shows now (null: none), for the cursor. */
  shown: string | null = null;
  /** A held E / right button: where, the options then, the timer, the open ring's pick. */
  private held: { p: P; client: P; opts: Option[]; timer: number; open: boolean; sel: number; by: 'key' | 'mouse' } | null = null;

  constructor(private s: SandboxScene) {
    this.el = document.createElement('div');
    this.el.id = 'hoverAct';
    this.el.className = 'rf rf-label'; // the kit's hover label (./hud/kit.ts)
    this.el.style.cssText = 'display:none;z-index:5';
    document.body.appendChild(this.el);
    this.ring = new Radial(); // ./hud/radial.ts: the pie
    s.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === 'escape') return this.close();
      if (k !== 'e' || e.repeat || s.build.tool) return;
      this.press(s.input.activePointer, 'key');
    });
    s.input.keyboard!.on('keyup', (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'e') this.release('key'); });
    window.addEventListener('pointermove', (e) => this.track(e));
    window.addEventListener('pointerup', (e) => { if (e.button === 2) this.release('mouse'); });
    window.addEventListener('blur', () => this.close());
  }

  /** Is the radial menu open (the scene hides the hover label then)? */
  get open(): boolean {
    return !!this.held?.open;
  }

  /** E or right button down at canvas point p: a tap runs the recommended action, a hold opens the ring. */
  press(p: P, by: 'key' | 'mouse'): void {
    this.close();
    const opts = this.options(p);
    if (!opts.length) return;
    const r = this.s.game.canvas.getBoundingClientRect();
    const h = { p: { x: p.x, y: p.y }, client: { x: r.left + p.x, y: r.top + p.y }, opts, open: false, sel: -1, by, timer: 0 };
    h.timer = window.setTimeout(() => { if (this.held === h) this.openRing(); }, HOLD_MS);
    this.held = h;
  }

  /** E or right button up: run the ring's pick, or the recommended action on a tap. */
  release(by: 'key' | 'mouse'): void {
    const h = this.held;
    if (!h || h.by !== by) return;
    this.close();
    const o = h.open ? h.opts[h.sel] : h.opts.find((x) => !x.off);
    if (o && !o.off) o.run();
  }

  close(): void {
    if (this.held) clearTimeout(this.held.timer);
    this.held = null;
    this.ring.close();
  }

  private openRing(): void {
    const h = this.held!;
    h.open = true;
    this.ring.open(h.client.x, h.client.y, h.opts);
    this.el.style.display = 'none';
    h.sel = -1;
  }

  private track(e: PointerEvent): void {
    const h = this.held;
    if (!h?.open) return;
    const z = Number(this.ring.el.style.zoom) || 1, dx = e.clientX - h.client.x, dy = e.clientY - h.client.y;
    if (Math.hypot(dx, dy) < HUB * z) return this.pick(-1);
    const n = h.opts.length, a = Math.atan2(dy, dx) + Math.PI / 2;
    this.pick(((Math.round((a / (2 * Math.PI)) * n) % n) + n) % n);
  }

  private pick(i: number): void {
    if (this.held!.sel === i) return;
    this.held!.sel = i;
    this.ring.pick(i);
  }

  /** The label by the cursor: shown while own squads are selected and the pointer is over the map. */
  label(p: P | null): void {
    const a = p && !this.open && this.at(p);
    this.shown = a ? a.label : null;
    if (!a) { this.el.style.display = 'none'; return; }
    const r = this.s.game.canvas.getBoundingClientRect(), z = Number(this.el.style.zoom) || 1;
    if (this.el.dataset.t !== a.label) { this.el.dataset.t = a.label; this.el.innerHTML = '<b>E:</b> '; this.el.append(a.label); }
    this.el.style.left = `${Math.round((r.left + p!.x + 16) / z)}px`;
    this.el.style.top = `${Math.round((r.top + p!.y + 14) / z)}px`;
    this.el.style.display = '';
  }

  /** The recommended context action for pointer p (canvas px), null with no own squad selected. */
  at(p: P): Action | null {
    return this.options(p).find((o) => !o.off) ?? null;
  }

  /** M5h3: the Fortifier works on own building b (iron-bind a gate, wet hides on burnable wood), greyed with the reason. */
  private fortify(b: BuildingSnap): Option[] {
    const s = this.s, def = BUILDINGS[b.type], o: Option[] = [];
    const iron = def.wall === 'gate', wet = !!def.burnable && !def.field;
    if (!iron && !wet) return o;
    const stock = s.sim.cur?.stock?.[TEAM] ?? {}, have = (r: string) => (stock as Record<string, number>)[r] ?? 0;
    const up = b.state === 'done' || b.state === 'damaged';
    const no = !sandboxCraft(s, sandboxRoster(s)).engineerNodes().has('fortifier') ? 'needs an engineer with Fortifier' : !up ? 'not finished' : undefined;
    const run = (fort: 'ironGate' | 'wetHides', label: string) => () => { s.sim.order({ kind: 'fortify', team: TEAM, building: b.id, fort }); s.mark(b.x, b.y, 0x60d060); s.siege.status = label; };
    if (iron) {
      const off = no ?? (b.iron ? 'already iron-bound' : have('iron') < FORT.ironCost.iron || have('charcoal') < FORT.ironCost.charcoal ? `needs ${FORT.ironCost.iron} iron, ${FORT.ironCost.charcoal} charcoal` : undefined);
      o.push({ label: 'iron-bind gate', icon: 'bld-gate', off, run: run('ironGate', 'iron-bind gate') });
    }
    if (wet) {
      const n = FORT.wetCost * (b.tiles.length / 2);
      const off = no ?? (b.wet ? 'hides already hung' : have('hides') < n ? `needs ${n} hides` : undefined);
      o.push({ label: 'wet hides', icon: 'act-extinguish', off, run: run('wetHides', 'wet hides') });
    }
    return o;
  }

  /** Every action for the target under pointer p, the recommended one first; [] with no own squad selected. */
  options(p: P): Option[] {
    const s = this.s, sc = s.siege, own = sc.own();
    if (!own.length) return [];
    const t = s.tileAt(p), order = (f: (q: number) => Parameters<typeof s.sim.order>[0]) => { for (const q of own) s.sim.order(f(q)); };
    const engines = own.map((q) => sc.engineOf(q));
    const carrying = engines.some((e) => e?.type === 'siegeLadder');
    const driving = engines.some((e) => e && e.type !== 'siegeLadder');
    const act = (label: string, ic: string, at: P, colour: number, run: () => void, off?: string): Option => ({ label, icon: ic, off, run: () => { run(); s.mark(at.x, at.y, colour); sc.status = label; } });
    const g = s.target(p);
    const move: Option = { label: g.px ? 'move up' : 'move', icon: 'act-move', run: () => s.moveTo(g) };
    /** Fire arrows at an enemy building or engine: the archers among the selection loose them. */
    const fire = (target: { building?: number; siege?: number }, at: P, name: string): Option => {
      const archers = own.filter((q) => s.drawn.some((d) => d.u.squad === q && d.u.cls === 'archer'));
      const fs = archers.map((q) => (s.sim.squads.get(q) as (SquadSnap & { fireArrows?: FireSnap }) | undefined)?.fireArrows).find((f) => f && !f.available);
      const off = !archers.length ? 'needs archers' : fs ? (FIRE_WHY[fs.reason ?? ''] ?? 'not available') : undefined;
      return act(`fire arrows at ${name}`, 'act-fire-arrows', at, 0xff8030, () => {
        for (const q of archers) {
          s.sim.order({ kind: 'fireArrows', squad: q, on: true });
          sc.fire.add(q as SquadId);
          s.sim.order({ kind: 'attackBuilding', squad: q, ...target });
        }
      }, off);
    };

    const foe = carrying ? null : s.pick(p, false);
    if (foe) {
      const o: Option[] = [{ label: `attack ${foe.u.cls.replace(/_/g, ' ')}`, icon: 'act-attack', run: () => s.attackSquad(foe) }];
      const ac = activesOf(s, own).find((x) => !activeWhy(x.a)) ?? activesOf(s, own)[0];
      if (ac) o.push({ label: `${ACTIVE_UI[ac.a.skill]?.name.toLowerCase() ?? ac.a.skill} (${activeEffect(ac.a.skill)})`, icon: ACTIVE_UI[ac.a.skill]?.icon ?? 'act-hold', off: activeWhy(ac.a), run: () => { fireActives(s, own); sc.status = 'active fired'; } });
      return [...o, move];
    }

    // M6k trade (./trade/tradeControls.ts): own carts, loot piles, chests
    const th = s.trade.at(t);
    if (th && th.kind !== 'store' && !(th.kind === 'cart' && th.team !== TEAM) && !(th.kind === 'chest' && th.team !== TEAM)) {
      const o = s.trade.options(th, own, move);
      if (th.kind === 'cart') {
        const e = sc.engineAt(t, false);
        if (e?.burning) o.unshift(act(`extinguish ${th.name}`, 'act-extinguish', e, 0x60b0ff, () => order((squad) => ({ kind: 'extinguish', squad, siege: e.id }))));
      }
      return o;
    }
    const mine = sc.engineAt(t, false);
    if (mine) {
      const name = SIEGE_NAME[mine.type], o: Option[] = [];
      const crewing = engines.some((e) => e?.id === mine.id);
      if (mine.burning) o.push(act(`extinguish ${name}`, 'act-extinguish', mine, 0x60b0ff, () => order((squad) => ({ kind: 'extinguish', squad, siege: mine.id }))));
      if (crewing) {
        o.push(act(`uncrew ${name}`, 'act-crew', mine, 0x60d060, () => order((squad) => ({ kind: 'uncrew', squad }))));
        if (mine.type === 'stoneThrower') o.push(act(mine.state === 'deployed' || mine.state === 'deploying' ? 'pack up' : 'deploy', 'act-deploy', mine, 0x60d060, () => sc.deploy()));
      } else o.push(act(`crew ${name}`, 'act-crew', mine, 0x60d060, () => s.sim.order({ kind: 'crew', squad: own[0], siege: mine.id }), mine.state === 'building' ? 'still being built' : mine.crew >= 0 ? 'already crewed' : undefined));
      if (o.some((x) => !x.off)) return [...o, move];
    }
    const theirs = sc.engineAt(t, true);
    if (theirs) {
      const name = SIEGE_NAME[theirs.type];
      const cap = th?.kind === 'cart' && th.team !== TEAM ? s.trade.options(th, own, move).slice(0, 1) : [];
      return [
        ...cap,
        act(`ignite ${name}`, 'act-ignite', theirs, 0xff8030, () => order((squad) => ({ kind: 'ignite', squad, siege: theirs.id })), theirs.burning ? 'already burning' : driving ? 'a crew carries no torches' : undefined),
        act(`attack ${name}`, 'act-attack', theirs, 0xff4040, () => order((squad) => ({ kind: 'attackBuilding', squad, siege: theirs.id }))),
        fire({ siege: theirs.id }, theirs, name),
      ];
    }
    const lad = sc.tileNear(t, (b) => b.siege !== undefined && b.team !== TEAM, LADDER_R);
    if (lad) return [act('push ladder', 'act-push-ladder', { x: lad.x + 0.5, y: lad.y + 0.5 }, 0xffe070, () => order((squad) => ({ kind: 'pushLadder', squad, ladder: lad.b.id }))), move];
    const b = s.build.buildingAt(t);
    const foeBuilding = (b: BuildingSnap): Option[] => [
      act(`ignite ${nameOf(b)}`, 'act-ignite', t, 0xff8030, () => order((squad) => ({ kind: 'ignite', squad, building: b.id })),
        !BUILDINGS[b.type].burnable ? `${nameOf(b)} does not burn` : b.state === 'foundation' ? 'nothing built to burn yet' : b.burning ? 'already burning' : driving ? 'a crew carries no torches' : undefined),
      act(`attack ${nameOf(b)}`, 'act-attack', t, 0xff4040, () => order((squad) => ({ kind: 'attackBuilding', squad, building: b.id }))),
      fire({ building: b.id }, t, nameOf(b)),
    ];
    const walled = (b: BuildingSnap) => b.team !== TEAM && !!BUILDINGS[b.type].walk && !BUILDINGS[b.type].access && (b.state === 'done' || b.state === 'damaged');
    if (carrying) {
      const w = sc.tileNear(t, walled);
      if (w) return [act('raise ladder', 'act-raise-ladder', { x: w.x + 0.5, y: w.y + 0.5 }, 0xffe070, () => order((squad) => ({ kind: 'raiseLadder', squad, wallTile: [w.x, w.y] }))), ...(b && b.team !== TEAM ? foeBuilding(b) : [])];
    }
    if (b && b.team !== TEAM) {
      const o = foeBuilding(b);
      if (th && th.team !== TEAM && (th.kind === 'chest' || th.kind === 'store')) o.push(...s.trade.options(th, own, move));
      if (walled(b)) o.push({ label: 'raise ladder', icon: 'act-raise-ladder', off: 'needs a siege ladder carried', run: () => {} });
      return o;
    }
    if (b) {
      const o: Option[] = [];
      if (b.burning) o.push(act(`extinguish ${nameOf(b)}`, 'act-extinguish', t, 0x60b0ff, () => order((squad) => ({ kind: 'extinguish', squad, building: b.id }))));
      if (isSite(b)) {
        const label = `${b.progress > 0 && !b.workers ? 'resume' : 'build'} ${nameOf(b)}`;
        o.push(act(label, 'act-build', b, 0x60d060, () => { for (const q of own) s.build.sendTo(q, b.id); }));
      } else if (b.hp < b.maxHp - 1e-6 && !BUILDINGS[b.type].brazier) {
        // M7a/M7g: mend it, paid as it goes (REPAIR: every 10% of hp 5% of its cost and labour)
        o.push(act(`repair ${nameOf(b)}`, 'act-build', b, 0x60d060, () => order((squad) => ({ kind: 'repairBuilding', squad, building: b.id })), b.mend ? 'already under repair' : undefined));
      }
      const f = this.fortify(b);
      // M6k: an own store or chest: unload into it / load from it (recommended when nothing else is to do)
      const tr = th && (th.kind === 'store' || th.kind === 'chest') && (b.state === 'done' || b.state === 'damaged') ? s.trade.options(th, own, move) : [];
      if (tr.length) return [...o, ...tr, move, ...f];
      if (o.length) return [...o, move, ...f];
      if (f.length) return [move, ...f];
    }
    // M7g: an own pre-built ruin: rebuild it (the first squad builds the site; landmark pieces only by restore)
    const ru = !b ? s.build.pieceAt(t) : undefined;
    if (ru?.ruin && ru.team === TEAM) {
      return [act(`rebuild ${nameOf(ru)}`, 'act-build', ru, 0x60d060, () => s.sim.order({ kind: 'rebuild', building: ru.id, squad: own[0] }), ru.landmark ? 'a landmark piece: restore the landmark' : undefined), move];
    }
    const cp = (s.sim.cur?.claims ?? []).find((c) => Math.hypot(c.x - t.x, c.y - t.y) < CLAIM_PICK);
    if (cp && (cp.state === 'open' || cp.state === 'contested' || cp.state === 'channel')) return [act('claim region', 'act-assign', cp, 0xffe070, () => s.sim.order({ kind: 'claimRegion', squad: own[0], point: cp.id })), move];
    if (cp && cp.state === 'locked') return [{ ...move, label: 'move (claim locked: clear the lairs)' }];
    const n = s.build.hover;
    if (n?.guarded) return [{ ...move, label: `move (${n.res} guarded by a lair)` }];
    if (n && n.amount >= 1) return [act(`gather ${n.res}`, 'act-gather', n, 0xffe070, () => order((squad) => ({ kind: 'gather', squad, node: n.id }))), move];
    return [move];
  }
}
