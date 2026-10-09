import { describe, expect, it } from 'vitest';
import { armySpec } from '../src/game/armySpec';
import { makeHero, type Archetype } from '../src/game/heroes';
import { Battle, RULES, TICK_RATE } from '../src/sim/battle';
import { POWER_RULES } from '../src/sim/powers';
import { Rng } from '../src/sim/rng';
import { computeStats } from '../src/sim/stats';
import { POWERS, type ItemPower, type PowerId } from '../src/data/affixes';
import { SET_RULES, type SetSpecial } from '../src/data/sets';
import type { SimEvent, SimUnit } from '../src/sim/types';
import { runToEnd, standardSetup } from './helpers';

/** An RNG stuck at one value: 0 makes every chance succeed (and a hit always land), 0.999 makes them all fail. */
class FixedRng extends Rng {
  constructor(private v: number) {
    super(1);
  }
  next(): number {
    return this.v;
  }
}

interface Man {
  arch?: Archetype;
  powers?: (PowerId | ItemPower)[];
  sets?: SetSpecial[];
}

const pw = (p: PowerId | ItemPower): ItemPower => (typeof p === 'string' ? { id: p, grade: 0 } : p);

/**
 * Hand-built battle: side 0 and side 1 men with the given powers, every one
 * of them standing still facing +y, the first man of side 0 right behind the
 * first of side 1 (so his blows land in the rear: no shield in the way).
 */
function field(a: Man[], d: Man[], v = 0): { b: Battle; u: SimUnit; t: SimUnit } {
  const rng = new Rng(5);
  const ids = { nextId: 1 };
  const spec = (men: Man[], side: number) => {
    const heroes = men.map((m) => makeHero(rng, ids, m.arch === 'slinger' ? 'phoenician' : 'greek', m.arch ?? 'swordsman', 3, 2, 0));
    const s = armySpec(heroes, false);
    s.units.forEach((u, i) => {
      u.stats.powers = (men[i].powers ?? []).map(pw);
      if (men[i].sets) u.stats.setSpecials = men[i].sets;
      if (side === 1 && i === 0 && !men[i].powers?.length && !men[i].sets) u.stats.powers = [];
    });
    return s;
  };
  const sa = spec(a, 0);
  const sd = spec(d, 1);
  // a harmless power somewhere so the power system runs in every fixture (Eagle Eye on a man with no missiles)
  if (![...sa.units, ...sd.units].some((u) => u.stats.powers?.length || u.stats.setSpecials?.length)) sd.units[0].stats.powers = [pw('eagle_eye')];
  const b = new Battle({ seed: 5, armies: [sa, sd], timeLimit: 600 });
  b.units.forEach((x, i) => {
    x.fx = 0;
    x.fy = 1;
    x.x = 6 + (x.side === 0 ? i : i - a.length) * 0.9 + (x.side === 1 && i - a.length > 0 ? 8 : 0);
    x.y = x.side === 0 ? 17 : 18;
  });
  const u = b.units[0];
  const t = b.units[a.length];
  t.x = u.x;
  b.rng = new FixedRng(v);
  b.drainEvents();
  return { b, u, t };
}

// private sim methods, called directly for one blow, one shot, one tick
const melee = (b: Battle, u: SimUnit, t: SimUnit) => (b as unknown as { meleeAttack(u: SimUnit, t: SimUnit): void }).meleeAttack(u, t);
const shoot = (b: Battle, u: SimUnit, t: SimUnit) => (b as unknown as { shoot(u: SimUnit, t: SimUnit): void }).shoot(u, t);
const morale = (b: Battle, u: SimUnit) => b.updateMorale(u, 1);
const ticks = (b: Battle, n: number) => {
  for (let i = 0; i < n; i++) {
    b.tick++;
    b.pw!.tick();
  }
};
const procs = (b: Battle, id: string) => b.drainEvents().filter((e): e is Extract<SimEvent, { type: 'proc' }> => e.type === 'proc' && e.power === id);
const g = (id: PowerId, grade = 0) => POWERS[id].grades[grade];

/** HP the first defender loses to one blow from the first attacker. */
function blow(a: Man, d: Man = {}, before?: (b: Battle, u: SimUnit, t: SimUnit) => void): { lost: number; b: Battle; u: SimUnit; t: SimUnit } {
  const f = field([a], [d]);
  before?.(f.b, f.u, f.t);
  const hp = f.t.hp;
  melee(f.b, f.u, f.t);
  return { lost: hp - f.t.hp, ...f };
}

describe('powers in battle', () => {
  it('Blood Price: a proc doubles the blow and costs the wearer HP', () => {
    const plain = blow({});
    const r = blow({ powers: ['blood_price'] });
    expect(r.lost).toBeCloseTo(plain.lost * 2, 6);
    expect(r.u.hp).toBeCloseTo(r.u.stats.maxHp * (1 - g('blood_price').extra!), 6);
    expect(procs(r.b, 'blood_price')).toHaveLength(1);
    // never below 1 HP
    const low = blow({ powers: ['blood_price'] }, {}, (_b, u) => (u.hp = 1.5));
    expect(low.u.hp).toBe(1);
    // the chance fails: nothing happens
    const f = field([{ powers: ['blood_price'] }], [{}], 0.999);
    expect(f.b.pw!.dmgOut(f.u, f.t, 10, false)).toBe(10);
  });

  it('Battle Frenzy: a kill quickens the wearer for a while', () => {
    const { b, u, t } = field([{ powers: ['frenzy'] }], [{}]);
    t.hp = 0.1;
    melee(b, u, t);
    expect(t.state).toBe('dead');
    expect(b.pw!.tempo(u)).toBeCloseTo(1 + g('frenzy').value!, 6);
    expect(procs(b, 'frenzy')).toHaveLength(1);
    ticks(b, g('frenzy').time! * TICK_RATE);
    expect(b.pw!.tempo(u)).toBe(1);
  });

  it('Sunder: max HP drops for a while, HP is capped, then max HP comes back', () => {
    const { b, u, t } = field([{ powers: ['sunder'] }], [{}]);
    const max = t.stats.maxHp;
    melee(b, u, t);
    expect(t.stats.maxHp).toBeCloseTo(max * (1 - g('sunder').value!), 6);
    expect(t.hp).toBeLessThanOrEqual(t.stats.maxHp);
    expect(b.result().units[1].maxHp).toBeCloseTo(max, 6);
    // a second proc only refreshes it: never sundered twice at a time
    melee(b, u, t);
    expect(t.stats.maxHp).toBeCloseTo(max * (1 - g('sunder').value!), 6);
    ticks(b, g('sunder').time! * TICK_RATE);
    expect(t.stats.maxHp).toBeCloseTo(max, 6);
  });

  it('Rend Armour: armour drops per proc, stacks twice, then wears off', () => {
    const { b, u, t } = field([{ powers: ['rend'] }], [{}]);
    melee(b, u, t);
    expect(b.pw!.rended(t)).toBe(g('rend').value);
    melee(b, u, t);
    melee(b, u, t);
    expect(b.pw!.rended(t)).toBe(g('rend').value! * POWER_RULES.rendStacks);
    ticks(b, g('rend').time! * TICK_RATE);
    expect(b.pw!.rended(t)).toBe(0);
    // rent armour lets the blows bite deeper (a hoplite has armour to lose)
    const h = field([{ powers: ['rend'] }], [{ arch: 'hoplite' }]);
    expect(h.t.stats.armor).toBeGreaterThan(0);
    let hp = h.t.hp;
    melee(h.b, h.u, h.t);
    const first = hp - h.t.hp;
    melee(h.b, h.u, h.t);
    hp = h.t.hp;
    melee(h.b, h.u, h.t);
    expect(hp - h.t.hp).toBeGreaterThan(first);
  });

  it('Second Wind: once, below 30% HP, heals and restores stamina', () => {
    const { b, u, t } = field([{}], [{ powers: ['second_wind'] }]);
    t.hp = t.stats.maxHp * POWER_RULES.secondWindAt + 0.2;
    t.stamina = 10;
    melee(b, u, t);
    expect(t.hp).toBeGreaterThan(t.stats.maxHp * POWER_RULES.secondWindAt);
    expect(t.stamina).toBe(10 + g('second_wind').extra!);
    expect(procs(b, 'second_wind')).toHaveLength(1);
    t.hp = t.stats.maxHp * 0.2;
    melee(b, u, t);
    expect(t.hp).toBeLessThan(t.stats.maxHp * 0.2);
  });

  it('Aegis: the next front or side hit is blocked for sure, then it recharges', () => {
    // the block roll itself always fails (0.999): only Aegis can turn the blow
    const { b, u, t } = field([{}], [{ arch: 'hoplite', powers: ['aegis'] }], 0.999);
    expect(t.stats.shield).not.toBe('none');
    expect(b.blocks(t, u, 'front', 0, false)).toBe(true);
    expect(procs(b, 'aegis')).toHaveLength(1);
    expect(b.blocks(t, u, 'front', 0, false)).toBe(false);
    ticks(b, g('aegis').time! * TICK_RATE);
    expect(b.blocks(t, u, 'rear', 0, false)).toBe(false);
    expect(b.blocks(t, u, 'side', 0, false)).toBe(true);
    expect(b.blocks(t, u, 'side', 0, false)).toBe(false);
  });

  it('Retribution: melee attackers take a share of their blow back', () => {
    const r = blow({}, { powers: ['retribution'] });
    expect(r.u.stats.maxHp - r.u.hp).toBeCloseTo(r.lost * g('retribution').value!, 6);
    expect(procs(r.b, 'retribution')).toHaveLength(1);
  });

  it('Retribution: a blow that kills the wearer is not returned', () => {
    const r = blow({}, { powers: ['retribution'] }, (_b, _u, t) => (t.hp = 0.1));
    expect(r.t.state).toBe('dead');
    expect(r.u.hp).toBe(r.u.stats.maxHp);
    expect(procs(r.b, 'retribution')).toHaveLength(0);
  });

  it("Wolf's Hunger: heals a share of the damage dealt", () => {
    const r = blow({ powers: ['hunger'] }, {}, (_b, u) => (u.hp = 10));
    expect(r.u.hp).toBeCloseTo(10 + r.lost * g('hunger').value!, 6);
  });

  it('Terror: a kill shakes the enemies around the fallen', () => {
    const { b, u, t } = field([{ powers: ['terror'] }], [{}, {}]);
    const near = b.units[2];
    near.x = t.x + 1;
    near.y = t.y;
    const m0 = near.morale;
    t.hp = 0.1;
    melee(b, u, t);
    // the death itself costs allies morale too; Terror comes on top of it
    expect(m0 - near.morale).toBeCloseTo((g('terror').value! + RULES.allyDeathMorale) * b.ml(near), 6);
    expect(procs(b, 'terror')[0].targets).toEqual([near.id]);
  });

  it('Steadfast: allies close by take less morale damage', () => {
    const { b, u } = field([{ powers: ['steadfast'] }, {}], [{}]);
    const ally = b.units[1];
    ally.x = u.x + 1;
    const before = b.ml(ally);
    b.tick = 0;
    ticks(b, 1);
    expect(b.ml(ally)).toBeCloseTo(before * (1 - g('steadfast').value!), 6);
    ally.x = u.x + g('steadfast').extra! + 1;
    b.tick = 10;
    ticks(b, 1);
    expect(b.ml(ally)).toBeCloseTo(before, 6);
  });

  it('Eagle Eye: a missile can ignore the shield', () => {
    const { b, u, t } = field([{ arch: 'slinger', powers: ['eagle_eye'] }], [{ arch: 'hoplite' }]);
    expect(b.blocks(t, u, 'front', 0, true)).toBe(false);
    expect(procs(b, 'eagle_eye')).toHaveLength(1);
    // a melee blow, or no shield to ignore: the plain roll (always a block at 0)
    expect(b.blocks(t, u, 'front', 0, false)).toBe(true);
  });

  it('Twin Shot: a second missile for free', () => {
    const { b, u, t } = field([{ arch: 'slinger', powers: ['twin_shot'] }], [{}]);
    t.y = u.y + 6;
    const ammo = u.ammo;
    shoot(b, u, t);
    expect(b.projectiles).toHaveLength(2);
    expect(u.ammo).toBe(ammo - 1);
  });

  it('Unshaken: a charge does not stun the wearer and hurts him less', () => {
    const charge = (d: Man) =>
      blow({}, d, (_b, u) => {
        u.momentum = RULES.chargeMomentumTicks;
      });
    const plain = charge({});
    const un = charge({ powers: ['unshaken'] });
    expect(plain.t.stun).toBe(8);
    expect(un.t.stun).toBe(0);
    expect(un.lost).toBeCloseTo(plain.lost * (1 - g('unshaken').value!), 6);
  });

  it('Momentum: a harder charge and a longer stun', () => {
    const charge = (a: Man) =>
      blow(a, {}, (_b, u) => {
        u.momentum = RULES.chargeMomentumTicks;
      });
    const plain = charge({});
    const mo = charge({ powers: ['momentum'] });
    expect(mo.lost).toBeCloseTo(plain.lost * (1 + g('momentum').value!), 6);
    expect(mo.t.stun).toBe(plain.t.stun + Math.round(g('momentum').extra! * TICK_RATE));
  });

  it('Last Stand: below 25% HP more damage, and he does not rout', () => {
    const plain = blow({}, {}, (_b, u) => (u.hp = 1));
    const ls = blow({ powers: ['last_stand'] }, {}, (_b, u) => (u.hp = 1));
    expect(ls.lost).toBeCloseTo(plain.lost * (1 + g('last_stand').value!), 6);
    const { b, u } = field([{ powers: ['last_stand'] }], [{}]);
    u.hp = 1;
    u.morale = 0;
    morale(b, u);
    expect(u.state).toBe('ready');
    u.hp = u.stats.maxHp;
    u.morale = 0;
    morale(b, u);
    expect(u.state).toBe('routing');
  });

  it('Executioner: more damage against men below 30% HP', () => {
    const low = (_b: Battle, _u: SimUnit, t: SimUnit) => (t.hp = t.stats.maxHp * 0.29);
    const plain = blow({}, {}, low);
    const ex = blow({ powers: ['executioner'] }, {}, low);
    expect(ex.lost).toBeCloseTo(plain.lost * (1 + g('executioner').value!), 6);
  });

  it('grade II reads the legendary numbers', () => {
    const plain = blow({});
    const r = blow({ powers: [{ id: 'blood_price', grade: 1 }] });
    expect(r.lost).toBeCloseTo(plain.lost * 2, 6);
    const f = field([{ powers: [{ id: 'frenzy', grade: 1 }] }], [{}]);
    f.t.hp = 0.1;
    melee(f.b, f.u, f.t);
    expect(f.b.pw!.tempo(f.u)).toBeCloseTo(1 + g('frenzy', 1).value!, 6);
  });

  it('ignores unknown powers and specials from a client', () => {
    const f = field([{}], [{}]);
    const s = armySpec([makeHero(new Rng(1), { nextId: 1 }, 'greek', 'hoplite', 3, 2, 0)], false);
    (s.units[0].stats as unknown as { powers: unknown }).powers = [{ id: 'godmode', grade: 9 }, 7, null, { id: 'aegis', grade: 7 }];
    (s.units[0].stats as unknown as { setSpecials: unknown }).setSpecials = ['nope', 3];
    const b = new Battle({ seed: 1, armies: [s, armySpec([makeHero(new Rng(2), { nextId: 9 }, 'greek', 'hoplite', 3, 2, 0)], true)] });
    runToEnd(b, 400);
    expect(b.pw).not.toBeNull();
    expect(f.b.pw).not.toBeNull();
  });
});

describe('set specials in battle', () => {
  it('War Cry: enemies within reach lose morale once, when the foe first comes close', () => {
    const { b, u, t } = field([{ sets: ['war_cry'] }], [{}]);
    t.y = u.y + SET_RULES.warCry.radius + 2;
    const m0 = t.morale;
    ticks(b, 1);
    expect(t.morale).toBe(m0);
    t.y = u.y + 2;
    ticks(b, 1);
    expect(m0 - t.morale).toBeCloseTo(SET_RULES.warCry.morale * b.ml(t), 6);
    ticks(b, 1);
    expect(m0 - t.morale).toBeCloseTo(SET_RULES.warCry.morale * b.ml(t), 6);
    expect(procs(b, 'war_cry')).toHaveLength(1);
  });

  it('Rain of Arrows: every 5th shot looses 2 more', () => {
    const { b, u, t } = field([{ arch: 'slinger', sets: ['rain_of_arrows'] }], [{}]);
    t.y = u.y + 6;
    for (let i = 0; i < SET_RULES.rain.every; i++) shoot(b, u, t);
    expect(b.projectiles).toHaveLength(SET_RULES.rain.every + SET_RULES.rain.arrows);
  });

  it('Bond of the Band: more damage and block per set ally close by', () => {
    const { b, u, t } = field([{ sets: ['bond_of_the_band'] }, { sets: ['bond_of_the_band'] }, { sets: ['bond_of_the_band'] }], [{ arch: 'hoplite' }]);
    b.units[1].x = u.x + 1;
    b.units[2].x = u.x - 1;
    const block0 = b.blockChance(u, 'front', 0, false);
    b.tick = 0;
    ticks(b, 1);
    expect(b.pw!.dmgOut(u, t, 10, false)).toBeCloseTo(10 * (1 + 2 * SET_RULES.bond.dmg), 6);
    if (u.stats.shield !== 'none') expect(b.blockChance(u, 'front', 0, false)).toBeCloseTo(Math.min(0.85, block0 + 2 * SET_RULES.bond.block), 6);
  });

  it('Heel of Achilles: less damage from the front and side, more from behind', () => {
    const { b, t } = field([{}], [{ sets: ['heel_of_achilles'] }]);
    expect(b.pw!.dmgIn(t, 10, 'front')).toBe(10 * SET_RULES.heel.front);
    expect(b.pw!.dmgIn(t, 10, 'side')).toBe(10 * SET_RULES.heel.front);
    expect(b.pw!.dmgIn(t, 10, 'rear')).toBe(10 * SET_RULES.heel.rear);
  });

  it("Born to Rule: allies near the king hit harder; his group holds while he stands", () => {
    const { b, u, t } = field([{ sets: ['born_to_rule'] }, {}], [{}]);
    const ally = b.units[1];
    ally.x = u.x + 1;
    b.tick = 0;
    ticks(b, 1);
    expect(b.pw!.dmgOut(ally, t, 10, false)).toBeCloseTo(10 * (1 + SET_RULES.born.dmg), 6);
    ally.morale = 0;
    morale(b, ally);
    expect(ally.state).toBe('ready');
    // the king falls: the group can break again
    u.state = 'dead';
    b.tick = 10;
    ticks(b, 1);
    ally.morale = 0;
    morale(b, ally);
    expect(ally.state).toBe('routing');
  });
});

describe('named items in battle', () => {
  const wearer = (def: string, slot: 'armor' | 'helmet') => {
    const h = makeHero(new Rng(3), { nextId: 1 }, 'greek', 'hoplite', 3, 10, 0);
    h.attrs = { str: 15, agi: 15, end: 15, wil: 15 };
    h.equip[slot] = { uid: 'n1', def, rarity: 'legendary', cond: 100 };
    return computeStats(h);
  };

  it('the Nemean lion pelt shrugs off missile damage', () => {
    const s = wearer('nemean_pelt', 'armor');
    expect(s.missileWard).toBe(0.4);
    const { b, t } = field([{}], [{}]);
    t.stats.missileWard = s.missileWard;
    expect(b.pw!.missileIn(t)).toBeCloseTo(0.6, 6);
  });

  it('the Helm of Hades throws enemy missiles off', () => {
    const s = wearer('helm_of_hades', 'helmet');
    expect(s.shroud).toBe(0.3);
    const spread = (shroud: number) => {
      const { b, u, t } = field([{ arch: 'slinger' }], [{}]);
      t.y = u.y + 6;
      t.stats.shroud = shroud;
      shoot(b, u, t);
      return Math.abs(b.projectiles[0].tx - t.x);
    };
    expect(spread(0.3)).toBeGreaterThan(spread(0) * 1.5);
  });
});

describe('determinism with powers', () => {
  const kit = (rarity: 'epic' | 'legendary') => {
    const { setup, player, enemy } = standardSetup(4242, false);
    for (const h of [...player, ...enemy]) {
      h.attrs = { str: 15, agi: 15, end: 15, wil: 15 };
      for (const it of Object.values(h.equip)) if (it) it.rarity = rarity;
    }
    setup.armies = [armySpec(player, false), armySpec(enemy, true)];
    return setup;
  };

  it('the same seed and orders give the same battle and hash', () => {
    const run = () => {
      const b = new Battle(kit('legendary'));
      expect(b.pw).not.toBeNull();
      b.startBattle();
      const hashes: string[] = [];
      let fired = 0;
      for (let t = 0; t < 20 * 150 && b.phase !== 'ended'; t++) {
        if (b.tick === 20) b.issue(0, { kind: 'order', group: 0, order: 'advance' });
        if (b.tick === 200) b.issue(0, { kind: 'order', group: 0, order: 'charge' });
        b.step();
        fired += b.drainEvents().filter((e) => e.type === 'proc').length;
        if (b.tick % 50 === 0) hashes.push(b.hash());
      }
      return { hashes, fired, result: JSON.stringify(b.result()) };
    };
    const r1 = run();
    const r2 = run();
    expect(r1.fired).toBeGreaterThan(0);
    expect(r1.hashes).toEqual(r2.hashes);
    expect(r1.result).toEqual(r2.result);
  });

  it('replaying the order log reproduces the outcome', () => {
    const a = new Battle(kit('epic'));
    a.startBattle();
    for (let t = 0; t < 1500 && a.phase !== 'ended'; t++) {
      if (a.tick === 10) a.issue(0, { kind: 'order', group: 0, order: 'advance' });
      if (a.tick === 150) a.issue(0, { kind: 'order', group: 2, order: 'charge' });
      a.step();
    }
    const humanOrders = a.orderLog.filter((o) => o.side === 0);
    const b = new Battle(kit('epic'));
    b.startBattle();
    for (let t = 0; t < 1500 && b.phase !== 'ended'; t++) {
      for (const o of humanOrders) if (o.tick === b.tick) b.issue(0, o.order);
      b.step();
    }
    expect(b.hash()).toBe(a.hash());
  });

  it('a battle without powers has no power system (old replays play as before)', () => {
    expect(new Battle(standardSetup(7).setup).pw).toBeNull();
  });
});
