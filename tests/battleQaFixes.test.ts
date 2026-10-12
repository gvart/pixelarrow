/**
 * QA-03 battle findings (docs/v5/qa/PLAYTHROUGH.md S3-2, S3-8, S3-9, S3-10),
 * their pure rules on real sims: wiped groups lose their card and the
 * selection moves on, the deployment's overlap guard, the first-contact
 * pause, field badges that never stack.
 */
import { describe, expect, it, vi } from 'vitest';
import { armySpec } from '../src/game/armySpec';
import { generateEnemyArmy } from '../src/game/enemy';
import { standardArmy } from '../src/game/heroes';
import { Battle } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import type { SimEvent } from '../src/sim/types';
import { DEPLOY_GAP, MAX_NUDGE, nudgeDrop, slotSpots } from '../src/ui/dragFormation';

// battleHud.ts draws with Phaser; its HUD rules are pure. Phaser itself needs a browser.
vi.mock('phaser', () => {
  class C {}
  return { default: { GameObjects: { Container: C, Image: C, Text: C, Graphics: C, Rectangle: C }, Scene: C } };
});
const { BADGE_H, FirstContact, cardGroups, declutterBadges, nextSelection } = await import('../src/ui/battleHud');

function campaignBattle(seed = 7): Battle {
  const ids = { nextId: 1 };
  const player = standardArmy(new Rng(1234), ids);
  const enemy = generateEnemyArmy(new Rng(seed), ids, player, 0).heroes;
  return new Battle({ seed, armies: [armySpec(player, false), armySpec(enemy, true)] });
}

const formed = (b: Battle) => b.groups.filter((g) => g.side === 0 && !g.individual && b.members(g.id).length > 0);

describe('S3-2: a wiped group loses its card, and the selection moves on (CT-01 AC3)', () => {
  it('every man dead or fled: no card; men still running: the card stays', () => {
    const b = campaignBattle();
    b.startBattle();
    const [a, c] = formed(b);
    const ids = () => cardGroups(b, 0, false).map((x) => x.gid);
    expect(ids()).toContain(a.id);
    const men = b.members(a.id);
    men.forEach((u, i) => (u.state = i === 0 ? 'routing' : 'dead'));
    expect(ids()).toContain(a.id);
    men[0].state = 'fled';
    expect(ids()).not.toContain(a.id);
    expect(ids()).toContain(c.id);
  });

  it('the selection on a wiped group goes to the next living card, wrapping', () => {
    expect(nextSelection([1, 3], [1, 2, 3], 2)).toBe(3);
    expect(nextSelection([1, 2], [1, 2, 3], 3)).toBe(1);
    expect(nextSelection([1, 3], [1, 2, 3], 1)).toBe(1);
    expect(nextSelection([], [1], 1)).toBe(-1);
    expect(nextSelection([5], [1, 2], -1)).toBe(-1);
  });
});

describe('S3-8: the deployment overlap guard', () => {
  it('the default deployment is clear, so a turn or a reshape in place never slides', () => {
    const b = campaignBattle();
    const gs = formed(b);
    for (const g of gs) {
      const f = g.formation;
      const mine = slotSpots(b.activeMembers(g.id).map((u) => ({ lat: u.slotLat, dep: u.slotDep })), f.cx, f.cy, f.fx, f.fy);
      const others = b.units.filter((u) => u.side === 0 && u.group !== g.id);
      const z = b.deployZone(0);
      expect(nudgeDrop(mine, others, { x: f.cx, y: f.cy }, { x0: 0.5, y0: z.y0, x1: b.width - 0.5, y1: z.y1 })).toEqual({ x: 0, y: 0 });
    }
  });

  it('slotSpots lays the men where the sim puts them', () => {
    const b = campaignBattle();
    const g = formed(b)[0];
    const f = g.formation;
    const spots = slotSpots(b.activeMembers(g.id).map((u) => ({ lat: u.slotLat, dep: u.slotDep })), f.cx, f.cy, f.fx, f.fy);
    b.activeMembers(g.id).forEach((u, i) => {
      expect(spots[i].x).toBeCloseTo(u.x, 1);
      expect(spots[i].y).toBeCloseTo(u.y, 1);
    });
  });

  it('a group dropped onto another slides to the nearest free spot, clear of every man', () => {
    const b = campaignBattle();
    const [a, c] = formed(b);
    const fa = a.formation;
    const at = { x: c.formation.cx, y: c.formation.cy };
    const mine = slotSpots(b.activeMembers(a.id).map((u) => ({ lat: u.slotLat, dep: u.slotDep })), at.x, at.y, fa.fx, fa.fy);
    const others = b.units.filter((u) => u.side === 0 && u.group !== a.id);
    const z = b.deployZone(0);
    const bounds = { x0: 0.5, y0: z.y0, x1: b.width - 0.5, y1: z.y1 };
    const d = nudgeDrop(mine, others, at, bounds)!;
    expect(d).not.toBeNull();
    expect(Math.hypot(d.x, d.y)).toBeGreaterThan(0);
    expect(Math.hypot(d.x, d.y)).toBeLessThanOrEqual(MAX_NUDGE);
    for (const m of mine) for (const o of others) expect(Math.hypot(m.x + d.x - o.x, m.y + d.y - o.y)).toBeGreaterThanOrEqual(DEPLOY_GAP - 1e-9);
    // the sim, given the nudged drop, stacks nobody
    b.issue(0, { kind: 'form', group: a.id, cx: at.x + d.x, cy: at.y + d.y, fx: fa.fx, fy: fa.fy, frontage: fa.frontage });
    for (const m of b.activeMembers(a.id)) for (const o of others) expect(Math.hypot(m.x - o.x, m.y - o.y)).toBeGreaterThan(DEPLOY_GAP * 0.9);
  });

  it('no free spot within reach: refused (null)', () => {
    const others = [];
    for (let x = 0; x <= 20; x += 0.5) for (let y = 0; y <= 20; y += 0.5) others.push({ x, y });
    expect(nudgeDrop([{ x: 10, y: 10 }], others, { x: 10, y: 10 }, { x0: 0, y0: 0, x1: 20, y1: 20 })).toBeNull();
  });
});

describe('S3-9: the first-contact pause counts missiles and riders', () => {
  const units = [{ side: 0 }, { side: 0 }, { side: 1 }, { side: 1 }];
  const hit = (unit: number, by: number, ranged = false): SimEvent => ({ type: 'hit', tick: 5, unit, by, dmg: 3, dir: 'front', ranged });

  it('the first enemy missile on our men pauses, once', () => {
    const fc = new FirstContact();
    expect(fc.check(hit(2, 0, true), 0, units)).toBe(false); // our sling hits them: no
    expect(fc.check(hit(0, 2, true), 0, units)).toBe(true); // their javelin hits us
    expect(fc.check(hit(1, 3), 0, units)).toBe(false); // once
    expect(fc.check({ type: 'contact', tick: 9, side: 0, group: 0 }, 0, units)).toBe(false);
  });

  it("a rider's kill or a blocked blow counts; a death with no killer does not", () => {
    expect(new FirstContact().check({ type: 'death', tick: 3, unit: 1, by: 3 }, 0, units)).toBe(true);
    expect(new FirstContact().check({ type: 'block', tick: 3, unit: 1, by: 3 }, 0, units)).toBe(true);
    expect(new FirstContact().check({ type: 'death', tick: 3, unit: 1, by: -1 }, 0, units)).toBe(false);
  });

  it('melee contact still pauses (ours, not theirs)', () => {
    const fc = new FirstContact();
    expect(fc.check({ type: 'contact', tick: 9, side: 1, group: 4 }, 0, units)).toBe(false);
    expect(fc.check({ type: 'contact', tick: 9, side: 0, group: 0 }, 0, units)).toBe(true);
  });

  it('on a real fight, it fires no later than the sim\'s melee contact', () => {
    const b = campaignBattle();
    b.startBattle();
    for (const g of b.groups) if (g.side === 0) b.issue(0, { kind: 'order', group: g.id, order: 'charge' });
    const fc = new FirstContact();
    let first = -1;
    let contact = -1;
    for (let i = 0; i < 20 * 60 && contact < 0 && b.phase === 'battle'; i++) {
      b.step();
      for (const e of b.drainEvents()) {
        if (first < 0 && fc.check(e, 0, b.units)) first = e.tick;
        if (contact < 0 && e.type === 'contact' && e.side === 0) contact = e.tick;
      }
    }
    expect(first).toBeGreaterThanOrEqual(0);
    if (contact >= 0) expect(first).toBeLessThanOrEqual(contact);
  });
});

describe('S3-10: field badges never stack', () => {
  const overlap = (a: { x: number; y: number; w: number }, b: { x: number; y: number; w: number }) =>
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < BADGE_H;

  it('a melee cluster of 5 badges spreads out, each kept whole', () => {
    const slots = [
      { id: 1, x: 100, y: 200, w: 24, rank: 3 },
      { id: 2, x: 104, y: 202, w: 24, rank: 2 },
      { id: 3, x: 98, y: 199, w: 30, rank: 2 },
      { id: 7, x: 102, y: 201, w: 36, rank: 1 },
      { id: 8, x: 110, y: 204, w: 20, rank: 1 },
    ];
    const at = declutterBadges(slots);
    const placed = slots.map((s) => ({ ...at.get(s.id)!, w: s.w }));
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) expect(overlap(placed[i], placed[j]), `${i} ${j}`).toBe(false);
    // the selected group keeps its spot; nobody moves farther than a few plates
    expect(at.get(1)).toEqual({ x: 100, y: 200 });
    for (const s of slots) expect(Math.hypot(at.get(s.id)!.x - s.x, at.get(s.id)!.y - s.y)).toBeLessThan(80);
  });

  it('badges apart stay where they are', () => {
    const at = declutterBadges([
      { id: 1, x: 50, y: 100, w: 24, rank: 2 },
      { id: 2, x: 150, y: 100, w: 24, rank: 1 },
    ]);
    expect(at.get(1)).toEqual({ x: 50, y: 100 });
    expect(at.get(2)).toEqual({ x: 150, y: 100 });
  });
});
