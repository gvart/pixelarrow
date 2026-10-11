/**
 * EC-05 bot AI (src/sim/ai.ts): a garrison mans its palisade, missile groups
 * focus their fire, and a foot group closes into an orb against riders on
 * its flank but never against a frontal line. Every behaviour is the bot's
 * own logged orders, so a replay of the same setup gives the same battle.
 */
import { describe, expect, it } from 'vitest';
import { Battle } from '../src/sim/battle';
import { WALL_REACH } from '../src/sim/ai';
import { armySpec } from '../src/game/armySpec';
import { Campaign } from '../src/game/campaign';
import { classSquad } from '../src/dev/classBalance';
import { assaultCases } from '../src/dev/arcBalance';
import { generateBattlefield } from '../src/world/battlefield';
import { Rng } from '../src/sim/rng';
import type { BattleSetup, Order, Side } from '../src/sim/types';

/** A lair assault: a Greek line (bot, side 0) against a real garrison behind its palisade (bot, side 1). */
function assaultSetup(k: number): BattleSetup {
  const x = assaultCases(2)[k];
  const c = Campaign.fresh(x.world);
  const foe = c.garrisonEnemy(x.lair)!;
  const rng = new Rng(x.world * 31 + x.lair);
  const ids = { nextId: 1 };
  const mine = [...classSquad(rng, ids, 'hoplite', 8, 4, 0), ...classSquad(rng, ids, 'archer', 4, 4, 1)];
  const seed = 900 + k;
  return {
    seed,
    armies: [armySpec(mine, true), { ...armySpec(foe.heroes, true), doctrine: foe.doctrine, holdField: foe.holdField, works: foe.works }],
    terrain: generateBattlefield(seed, { ...c.assaultSite(x.lair), assault: true }),
  };
}

/** The palisade row's y (cell centre) on side 1's half. */
function wallY(b: Battle): number {
  const t = b.terrain!;
  for (let iy = 0; iy < t.h / 2; iy++) for (let ix = 0; ix < t.w; ix++) if (t.cellDef(iy * t.w + ix).kind === 'palisade') return ((iy + 0.5) * b.height) / t.h;
  throw new Error('no palisade');
}

function play(b: Battle, each?: (b: Battle) => void): void {
  b.startBattle();
  while (b.phase !== 'ended' && b.tick < b.timeLimitTicks + 10) {
    b.step();
    each?.(b);
  }
}

describe('EC-05: a garrison mans its palisade', () => {
  it('its skirmishers form up inside, and nobody goes out while every attacker is still short of the wall', () => {
    for (const k of [0, 1, 2, 3]) {
      const b = new Battle(assaultSetup(k));
      const wy = wallY(b);
      for (const u of b.units) if (u.side === 1 && u.state === 'ready') expect(u.y).toBeLessThan(wy);
      let quiet = 0;
      let outside = 0;
      b.startBattle();
      while (b.phase !== 'ended' && b.tick < 20 * 60) {
        b.step();
        const near = b.units.some((u) => u.side === 0 && u.state === 'ready' && u.y < wy + WALL_REACH + 1);
        if (near) break;
        quiet++;
        if (b.units.some((u) => u.side === 1 && u.state === 'ready' && u.y > wy + 0.5)) outside++;
      }
      expect(quiet).toBeGreaterThan(20 * 5);
      expect(outside).toBe(0);
    }
  });

  it('a field battle (no palisade) is untouched: the same setup without the assault field never holds back', () => {
    const s = assaultSetup(0);
    const field: BattleSetup = { ...s, terrain: undefined };
    const b = new Battle(field);
    let advanced = false;
    play(b, (bt) => {
      if (bt.sideGroups(1).some((g) => g.order === 'advance' || g.order === 'charge')) advanced = true;
    });
    expect(advanced).toBe(true);
  });
});

/** Side 0: 6 hoplites (group 0) + 6 archers (group 1), bot. Side 1: 8 hoplites + 4 slingers, bot or human. */
function shootSetup(seed: number, doctrine?: 'swarm'): BattleSetup {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const a = armySpec([...classSquad(rng, ids, 'hoplite', 6, 3, 0), ...classSquad(rng, ids, 'archer', 6, 3, 1)], true);
  const e = armySpec([...classSquad(rng, ids, 'hoplite', 8, 3, 0), ...classSquad(rng, ids, 'slinger', 4, 3, 1)], true);
  return { seed, armies: [{ ...a, doctrine }, e] };
}

describe('EC-05: bots focus their fire', () => {
  it('a steady bot focuses its archers on the enemy group its line is fighting', () => {
    let seen = 0;
    for (const seed of [11, 12, 13]) {
      const b = new Battle(shootSetup(seed));
      const archers = b.sideGroups(0)[1].id;
      const main = b.sideGroups(0)[0].id;
      play(b, (bt) => {
        const f = bt.groups[archers].focus ?? -1;
        if (f >= 0 && bt.groups[main].contact) {
          expect(bt.groups[f].side).toBe(1);
          expect(bt.groups[f].contact).toBe(true);
          seen++;
        }
      });
      expect(b.orderLog.some((o) => o.side === 0 && o.order.kind === 'focus' && o.order.group === archers)).toBe(true);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('a swarm bot (focusMissiles) focuses the enemy slingers', () => {
    const b = new Battle(shootSetup(21, 'swarm'));
    const archers = b.sideGroups(0)[1].id;
    const slingers = b.sideGroups(1)[1].id;
    play(b);
    const focus = b.orderLog.filter((o) => o.side === 0 && o.order.kind === 'focus' && o.order.group === archers).map((o) => (o.order as Extract<Order, { kind: 'focus' }>).target);
    expect(focus).toContain(slingers);
  });
});

/** Bot hoplites (side 1) against riders (human, side 0) sent round to their flank, or a foot line (human) sent straight at them. */
function orbSetup(seed: number, riders: boolean): Battle {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const foe = riders ? classSquad(rng, ids, 'companion', 4, 3, 0) : classSquad(rng, ids, 'hoplite', 8, 3, 0);
  const hop = classSquad(rng, ids, 'hoplite', 8, 3, 0);
  return new Battle({ seed, armies: [armySpec(foe, false), armySpec(hop, true)] });
}

describe('EC-05: the bot orb', () => {
  it('riders swinging onto a line’s flank close it into an orb', () => {
    let orbs = 0;
    for (const seed of [31, 32, 33]) {
      const b = orbSetup(seed, true);
      const line = b.sideGroups(1)[0];
      let orb = false;
      play(b, (bt) => {
        const f = bt.groups[line.id].formation;
        // the riders appear off the line's right flank, then charge it
        if (bt.tick === 1) for (const u of bt.units) if (u.side === 0) [u.x, u.y] = [f.cx + 6, f.cy - 1];
        if (bt.tick === 2) bt.issue(0 as Side, { kind: 'form', group: 0, cx: f.cx + 6, cy: f.cy - 1, fx: -1, fy: 0, frontage: 2 });
        if (bt.tick === 20 * 2) bt.issue(0 as Side, { kind: 'order', group: 0, order: 'charge' });
        if (bt.groups[line.id].formation.type === 'orb') orb = true;
      });
      if (orb) orbs++;
    }
    expect(orbs).toBeGreaterThan(0);
  });

  it('never against a frontal line of foot', () => {
    for (const seed of [41, 42, 43, 44]) {
      const b = orbSetup(seed, false);
      b.issue(0, { kind: 'order', group: 0, order: 'advance' });
      play(b, (bt) => expect(bt.sideGroups(1).every((g) => g.formation.type !== 'orb')).toBe(true));
    }
  });
});

describe('EC-05: deterministic', () => {
  it('the same assault, shooting and orb battles give the same hash twice', () => {
    const run = (mk: () => Battle) => {
      const b = mk();
      play(b);
      return `${b.winner}:${b.tick}:${b.hash()}`;
    };
    expect(run(() => new Battle(assaultSetup(1)))).toBe(run(() => new Battle(assaultSetup(1))));
    expect(run(() => new Battle(shootSetup(12)))).toBe(run(() => new Battle(shootSetup(12))));
    expect(run(() => orbSetup(31, true))).toBe(run(() => orbSetup(31, true)));
  });
});
