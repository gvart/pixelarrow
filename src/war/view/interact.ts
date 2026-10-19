/**
 * The context action (W-30): E and right click both run the action on the hovered target for the selected own squads,
 * and a label by the cursor names it first ("E: <action>"). By target, first match wins:
 *
 *   an enemy unit (not while carrying a ladder)        attack its squad
 *   own engine                                        burning: extinguish; ours: uncrew; free and built: crew
 *   enemy engine                                      ignite (torches; not burning yet, squad not driving an engine), else attack
 *   enemy siege ladder on our wall                    push it off
 *   enemy walkway wall or tower, a ladder carried     raise the ladder on that face
 *   enemy building                                    burnable wood not yet alight: ignite (as engines), else attack
 *   own building                                      burning: extinguish; unfinished: build / resume; damaged: repair
 *   claim banner (neutral region)                    open: claim the region (channel); locked: move there
 *   resource node                                     gather (guarded by a lair: move there)
 *   walkway, platform or stair top                    move up
 *   ground                                            move
 */
import { BUILDINGS } from '../sim/economy';
import type { BuildingSnap } from '../types';
import { isSite } from './build/buildMode';
import { SIEGE_NAME } from './siege/siegeControls';
import type { SandboxScene } from './SandboxScene';

export interface Action { label: string; run(): void }
type P = { x: number; y: number };
const TEAM = 0;
const LADDER_R = 1.1;
const CLAIM_PICK = 2.5; // tiles round a claim banner's foot
const nameOf = (b: BuildingSnap) => b.type.replace(/[A-Z]/g, (c) => ' ' + c.toLowerCase());

export class Interact {
  private el: HTMLDivElement;
  /** The action the label shows now (null: none), for the cursor. */
  shown: string | null = null;

  constructor(private s: SandboxScene) {
    this.el = document.createElement('div');
    this.el.id = 'hoverAct';
    this.el.className = 'rf rf-label'; // the kit's hover label (./hud/kit.ts)
    this.el.style.cssText = 'display:none;z-index:5';
    document.body.appendChild(this.el);
    s.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || e.key.toLowerCase() !== 'e' || s.build.tool) return;
      this.at(s.input.activePointer)?.run();
    });
  }

  /** The label by the cursor: shown while own squads are selected and the pointer is over the map. */
  label(p: P | null): void {
    const a = p && this.at(p);
    this.shown = a?.label ?? null;
    if (!a) { this.el.style.display = 'none'; return; }
    const r = this.s.game.canvas.getBoundingClientRect(), z = Number(this.el.style.zoom) || 1;
    if (this.el.dataset.t !== a.label) { this.el.dataset.t = a.label; this.el.innerHTML = '<b>E:</b> '; this.el.append(a.label); }
    this.el.style.left = `${Math.round((r.left + p!.x + 16) / z)}px`;
    this.el.style.top = `${Math.round((r.top + p!.y + 14) / z)}px`;
    this.el.style.display = '';
  }

  /** The context action for pointer p (canvas px), null with no own squad selected. */
  at(p: P): Action | null {
    const s = this.s, sc = s.siege, own = sc.own();
    if (!own.length) return null;
    const t = s.tileAt(p), order = (f: (q: number) => Parameters<typeof s.sim.order>[0]) => { for (const q of own) s.sim.order(f(q)); };
    const engines = own.map((q) => sc.engineOf(q));
    const carrying = engines.some((e) => e?.type === 'siegeLadder');
    const driving = engines.some((e) => e && e.type !== 'siegeLadder');
    const act = (label: string, at: P, colour: number, run: () => void): Action => ({ label, run: () => { run(); s.mark(at.x, at.y, colour); sc.status = label; } });

    const foe = carrying ? null : s.pick(p, false);
    if (foe) return { label: `attack ${foe.u.cls.replace(/_/g, ' ')}`, run: () => s.attackSquad(foe) };

    const mine = sc.engineAt(t, false);
    if (mine) {
      const name = SIEGE_NAME[mine.type];
      if (mine.burning) return act(`extinguish ${name}`, mine, 0x60b0ff, () => order((squad) => ({ kind: 'extinguish', squad, siege: mine.id })));
      if (engines.some((e) => e?.id === mine.id)) return act(`uncrew ${name}`, mine, 0x60d060, () => order((squad) => ({ kind: 'uncrew', squad })));
      if (mine.crew < 0 && mine.state !== 'building') return act(`crew ${name}`, mine, 0x60d060, () => s.sim.order({ kind: 'crew', squad: own[0], siege: mine.id }));
    }
    const theirs = sc.engineAt(t, true);
    if (theirs) {
      const name = SIEGE_NAME[theirs.type];
      if (!theirs.burning && !driving) return act(`ignite ${name}`, theirs, 0xff8030, () => order((squad) => ({ kind: 'ignite', squad, siege: theirs.id })));
      return act(`attack ${name}`, theirs, 0xff4040, () => order((squad) => ({ kind: 'attackBuilding', squad, siege: theirs.id })));
    }
    const lad = sc.tileNear(t, (b) => b.siege !== undefined && b.team !== TEAM, LADDER_R);
    if (lad) return act('push ladder', { x: lad.x + 0.5, y: lad.y + 0.5 }, 0xffe070, () => order((squad) => ({ kind: 'pushLadder', squad, ladder: lad.b.id })));
    if (carrying) {
      const w = sc.tileNear(t, (b) => b.team !== TEAM && !!BUILDINGS[b.type].walk && !BUILDINGS[b.type].access && (b.state === 'done' || b.state === 'damaged'));
      if (w) return act('raise ladder', { x: w.x + 0.5, y: w.y + 0.5 }, 0xffe070, () => order((squad) => ({ kind: 'raiseLadder', squad, wallTile: [w.x, w.y] })));
    }
    const b = s.build.buildingAt(t);
    if (b && b.team !== TEAM) {
      if (BUILDINGS[b.type].burnable && b.state !== 'foundation' && !b.burning && !driving) return act(`ignite ${nameOf(b)}`, t, 0xff8030, () => order((squad) => ({ kind: 'ignite', squad, building: b.id })));
      return act(`attack ${nameOf(b)}`, t, 0xff4040, () => order((squad) => ({ kind: 'attackBuilding', squad, building: b.id })));
    }
    if (b) {
      if (b.burning) return act(`extinguish ${nameOf(b)}`, t, 0x60b0ff, () => order((squad) => ({ kind: 'extinguish', squad, building: b.id })));
      if (isSite(b) || b.state === 'damaged') {
        const label = `${b.state === 'damaged' ? 'repair' : b.progress > 0 && !b.workers ? 'resume' : 'build'} ${nameOf(b)}`;
        return act(label, b, 0x60d060, () => { for (const q of own) s.build.sendTo(q, b.id); });
      }
    }
    const cp = (s.sim.cur?.claims ?? []).find((c) => Math.hypot(c.x - t.x, c.y - t.y) < CLAIM_PICK);
    if (cp && (cp.state === 'open' || cp.state === 'contested' || cp.state === 'channel')) return act('claim region', cp, 0xffe070, () => s.sim.order({ kind: 'claimRegion', squad: own[0], point: cp.id }));
    if (cp && cp.state === 'locked') return { label: 'move (claim locked: clear the lairs)', run: () => s.moveTo(s.target(p)) };
    const n = s.build.hover;
    if (n?.guarded) return { label: `move (${n.res} guarded by a lair)`, run: () => s.moveTo(s.target(p)) };
    if (n && n.amount >= 1) return act(`gather ${n.res}`, n, 0xffe070, () => order((squad) => ({ kind: 'gather', squad, node: n.id })));
    const g = s.target(p);
    return { label: g.px ? 'move up' : 'move', run: () => s.moveTo(g) };
  }
}
