import { describe, expect, it } from 'vitest';
import { Battle } from '../src/sim/battle';
import { capitals, findHexPath, hexDistance, hexInfo, hexesWithin, hexRound, hexToPixel, pixelToHex, SHARD_RADIUS } from '../src/online/hex';
import { defenderFor, neutralDefenders, isAnimal } from '../src/online/defenders';
import { accruedIncome, adjacencyBonus, canKick, canPromote, clanInviteLink, energyAt, hexIncome, inviteCodeFrom, starterOnlineArmy, DEFAULT_FORMATIONS } from '../src/online/rules';
import { flipResult, onlineBattleSetup, resolveAttack } from '../src/online/battle';
import { Lockstep } from '../src/online/lockstep';
import type { ClientMsg, ServerMsg } from '../src/online/protocol';
import type { Order, Side } from '../src/sim/types';

describe('hex shard world', () => {
  it('is deterministic per seed and has every kind of land', () => {
    const all = hexesWithin({ q: 0, r: 0 }, SHARD_RADIUS);
    expect(all.length).toBe(3 * SHARD_RADIUS * (SHARD_RADIUS + 1) + 1);
    const types = new Set(all.map((h) => hexInfo(7, h.q, h.r).type));
    for (const t of ['plains', 'farmland', 'forest', 'town', 'water']) expect(types.has(t as never)).toBe(true);
    expect(hexInfo(7, 3, -5)).toEqual(hexInfo(7, 3, -5));
    expect(all.filter((h) => hexInfo(7, h.q, h.r).fort).length).toBeGreaterThan(5);
    for (const c of capitals()) expect(hexInfo(7, c.q, c.r)).toMatchObject({ capital: true, type: 'town', tier: 5, passable: true });
  });

  it('round-trips pixel <-> hex and finds paths around water', () => {
    for (const h of [{ q: 0, r: 0 }, { q: 3, r: -2 }, { q: -5, r: 7 }]) expect(pixelToHex(hexToPixel(h, 10).x, hexToPixel(h, 10).y, 10)).toEqual(h);
    expect(hexRound(0.4, 0.4)).toEqual({ q: 0, r: 1 });
    const start = hexesWithin({ q: 0, r: 0 }, 6).find((h) => hexInfo(7, h.q, h.r).passable)!;
    const end = hexesWithin({ q: 0, r: 0 }, 6).reverse().find((h) => hexInfo(7, h.q, h.r).passable)!;
    const path = findHexPath(7, start, end, () => true);
    expect(path).not.toBeNull();
    for (let i = 1; i < path!.length; i++) {
      expect(hexDistance(path![i - 1], path![i])).toBe(1);
      expect(hexInfo(7, path![i].q, path![i].r).passable).toBe(true);
    }
  });
});

describe('neutral defenders', () => {
  it('depend on the hex type, are deterministic and get stronger toward the centre', () => {
    const seed = 99;
    const all = hexesWithin({ q: 0, r: 0 }, SHARD_RADIUS).map((h) => hexInfo(seed, h.q, h.r)).filter((h) => h.passable);
    const forest = all.find((h) => h.type === 'forest')!;
    expect(['beasts', 'outlaws']).toContain(defenderFor(seed, forest).id);
    const town = all.find((h) => h.type === 'town')!;
    expect(defenderFor(seed, town).id).toBe('city');
    const a = neutralDefenders(seed, forest, 0);
    expect(neutralDefenders(seed, forest, 0)).toEqual(a);
    expect(neutralDefenders(seed, forest, 1)).not.toEqual(a);
    const beastHex = all.find((h) => defenderFor(seed, h).id === 'beasts');
    if (beastHex) expect(neutralDefenders(seed, beastHex, 0).some(isAnimal)).toBe(true);
    const rim = all.find((h) => h.type === 'plains' && hexDistance(h, { q: 0, r: 0 }) > 28 && !h.coast)!;
    const inner = all.find((h) => h.type === 'plains' && hexDistance(h, { q: 0, r: 0 }) < 6 && !h.coast)!;
    expect(neutralDefenders(seed, inner, 0).length).toBeGreaterThanOrEqual(neutralDefenders(seed, rim, 0).length);
    const cap = capitals()[0];
    expect(neutralDefenders(seed, hexInfo(seed, cap.q, cap.r), 0).length).toBeGreaterThanOrEqual(14);
  });
});

describe('economy and clan rules', () => {
  it('accrues income lazily with an adjacency bonus and a cap', () => {
    const rate = hexIncome({ type: 'farmland', fort: false, capital: false });
    expect(accruedIncome(rate, 0, 3_600_000, 0).food).toBe(6);
    expect(accruedIncome(rate, 0, 3_600_000, adjacencyBonus(3)).food).toBe(7);
    expect(adjacencyBonus(9)).toBe(0.5);
    expect(accruedIncome(rate, 0, 100 * 3_600_000, 0)).toEqual(accruedIncome(rate, 0, 24 * 3_600_000, 0));
    expect(energyAt(0, 0, 3_600_000)).toBe(12);
    expect(energyAt(95, 0, 10 * 3_600_000)).toBe(100);
  });

  it('clan permissions and invite links', () => {
    expect(canKick('officer', 'member')).toBe(true);
    expect(canKick('officer', 'officer')).toBe(false);
    expect(canKick('member', 'member')).toBe(false);
    expect(canKick('leader', 'officer')).toBe(true);
    expect(canPromote('leader', 'member', 'officer')).toBe(true);
    expect(canPromote('officer', 'member', 'officer')).toBe(false);
    expect(clanInviteLink('pxbot', 'Ab12cd34')).toBe('https://t.me/pxbot/play?startapp=clan_Ab12cd34');
    expect(inviteCodeFrom('clan_Ab12cd34')).toBe('Ab12cd34');
    expect(inviteCodeFrom('evil_x')).toBeNull();
  });
});

describe('online battles', () => {
  it('builds a setup with terrain and resolves both sides of an attack', () => {
    const a = starterOnlineArmy(1, { nextId: 1 }, 'a_');
    const b = starterOnlineArmy(2, { nextId: 1 }, 'b_');
    const setup = onlineBattleSetup(5, { heroes: a, formations: DEFAULT_FORMATIONS, bot: false }, { heroes: b, formations: DEFAULT_FORMATIONS, bot: true }, { base: 'hills', river: false, coast: false, rocky: true, woods: 0.1 });
    expect(setup.terrain?.cells.length).toBe(24 * 36);
    const battle = new Battle(JSON.parse(JSON.stringify(setup)));
    battle.issue(0, { kind: 'order', group: 0, order: 'charge' });
    battle.startBattle();
    while (battle.phase !== 'ended' && battle.tick < 20 * 300) battle.step();
    const r = battle.result();
    expect(flipResult(flipResult(r))).toEqual(r);
    const res = resolveAttack(r, a, b, 5);
    expect(res.attacker.survivors.length + res.attacker.dead.length).toBe(a.length);
    expect(res.defender.survivors.length + res.defender.dead.length).toBe(b.length);
    expect(res.captured).toBe(r.winner === 0);
    expect(a[0].xp).toBe(0); // inputs untouched
  });
});

describe('lockstep adapter', () => {
  /** In-memory relay with the server's sealing rule (see server/src/online/duel.ts). */
  function relay(setupSeed = 11) {
    const a = starterOnlineArmy(3, { nextId: 1 }, 'a_');
    const b = starterOnlineArmy(4, { nextId: 1 }, 'b_');
    const setup = onlineBattleSetup(setupSeed, { heroes: a, formations: DEFAULT_FORMATIONS, bot: false }, { heroes: b, formations: DEFAULT_FORMATIONS, bot: false }, null);
    const inbox: [ServerMsg[], ServerMsg[]] = [[], []];
    let next = 0;
    const reached = [-1, -1];
    let pending: { side: Side; order: Order }[] = [];
    const ready = [false, false];
    const both = (m: ServerMsg) => inbox.forEach((q) => q.push(m));
    const seal = () => {
      const n = next++;
      both({ type: 'turn', duel: 'd', n, tick: n * 2, orders: pending });
      pending = [];
    };
    const server = (side: Side) => (m: ClientMsg) => {
      if (m.type === 'd_order') both({ type: 'd_order', duel: 'd', seq: 0, side, order: m.order });
      if (m.type === 'd_ready') {
        ready[side] = true;
        if (ready[0] && ready[1]) {
          both({ type: 'go', duel: 'd' });
          seal();
          seal();
        }
      }
      if (m.type === 'cmd') pending.push({ side, order: m.order });
      if (m.type === 'reach') {
        reached[side] = Math.max(reached[side], m.n);
        while (Math.min(reached[0], reached[1]) + 2 >= next) seal();
      }
    };
    const l0 = new Lockstep(new Battle(JSON.parse(JSON.stringify(setup))), 0, 'd', server(0));
    const l1 = new Lockstep(new Battle(JSON.parse(JSON.stringify(setup))), 1, 'd', server(1));
    const deliver = () => {
      for (const [i, l] of [l0, l1].entries()) while (inbox[i].length) l.receive(inbox[i].shift()!);
    };
    return { l0, l1, deliver };
  }

  it('both clients simulate the same battle; nobody runs ahead of sealed turns', () => {
    const { l0, l1, deliver } = relay();
    l0.issue({ kind: 'preset', group: 0, type: 'shieldwall' });
    l1.issue({ kind: 'preset', group: 4, type: 'wedge' });
    deliver();
    l0.markReady();
    l1.markReady();
    deliver();
    expect(l0.sim.phase).toBe('battle');
    let ordered = false;
    for (let i = 0; i < 20000 && (l0.sim.phase !== 'ended' || l1.sim.phase !== 'ended'); i++) {
      // Client 1 is slow: it steps only every other round.
      l0.pump(3);
      if (i % 2) l1.pump(3);
      expect(l0.sim.tick - l1.sim.tick).toBeLessThanOrEqual(2 * 3 + 3);
      if (!ordered && l0.sim.tick > 10) {
        l0.issue({ kind: 'order', group: 0, order: 'charge' });
        l1.issue({ kind: 'order', group: 4, order: 'charge' });
        ordered = true;
      }
      deliver();
    }
    expect(l0.sim.phase).toBe('ended');
    expect(l0.sim.hash()).toBe(l1.sim.hash());
    expect(JSON.stringify(l0.sim.orderLog)).toBe(JSON.stringify(l1.sim.orderLog));
  });
});
