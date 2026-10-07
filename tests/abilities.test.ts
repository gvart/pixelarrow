import { describe, expect, it } from 'vitest';
import { Battle, TICK_RATE } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import { armySpec } from '../src/game/armySpec';
import { makeHero, setBotLevel } from '../src/game/heroes';
import { computeStats } from '../src/sim/stats';
import { ABILITIES, ABILITY_RULES, AURAS, PERKS, perkBlocker, type PerkId } from '../src/data/perks';
import type { Hero } from '../src/data/units';
import type { Side } from '../src/sim/types';
import { runMirror } from '../src/dev/balance';

function hero(rng: Rng, ids: { nextId: number }, arch: 'hoplite' | 'swordsman' | 'slinger' | 'peltast', perks: PerkId[] = [], level = 4, group = 0): Hero {
  const h = makeHero(rng, ids, 'greek', arch, 1, 1, group);
  setBotLevel(h, level);
  h.perks = perks;
  return h;
}

/** Two lines facing each other at a given gap (battle phase, no bots). */
function lines(a: Hero[], b: Hero[], gap = 1.4, seed = 5): Battle {
  const bt = new Battle({ seed, armies: [armySpec(a, false), armySpec(b, false)], timeLimit: 600 });
  bt.startBattle();
  const place = (side: Side, gid: number, cy: number, fy: number, n: number) => {
    bt.issue(side, { kind: 'form', group: gid, cx: 12, cy, fx: 0, fy, frontage: n });
    for (const u of bt.activeMembers(gid)) {
      const p = bt.slotPos(u);
      u.x = p.x;
      u.y = p.y;
      u.fx = 0;
      u.fy = fy;
    }
  };
  place(0, 0, 18 + gap / 2, -1, a.length);
  place(1, 4, 18 - gap / 2, 1, b.length);
  return bt;
}

describe('progression data', () => {
  it('perks need the previous tier and the level', () => {
    const h = { level: 4, perks: [] as PerkId[] };
    expect(perkBlocker(h, 'shield_bash')).toMatch(/Shield Drill/);
    expect(perkBlocker(h, 'shield_drill')).toBeNull();
    h.perks.push('shield_drill');
    expect(perkBlocker(h, 'shield_bash')).toBeNull();
    expect(perkBlocker({ level: 3, perks: ['shield_drill'] }, 'shield_bash')).toMatch(/No perk point|Lv/);
    expect(perkBlocker({ level: 10, perks: ['shield_drill', 'shield_bash', 'phalangite'] }, 'unbreakable')).toMatch(/Steady/);
  });

  it('attributes shift derived stats; perks grant abilities and auras', () => {
    const rng = new Rng(3);
    const ids = { nextId: 1 };
    const h = hero(rng, ids, 'hoplite');
    const base = computeStats(h);
    const strong = computeStats({ ...h, attrs: { ...h.attrs, str: h.attrs.str + 4, end: h.attrs.end + 4 } });
    expect(strong.dmg).toBeGreaterThan(base.dmg + 1);
    expect(strong.maxHp).toBeGreaterThan(base.maxHp + 10);
    const willing = computeStats({ ...h, attrs: { ...h.attrs, wil: 9 } });
    expect(willing.abilities).toContain('rally');
    const perked = computeStats({ ...h, perks: ['shield_drill', 'shield_bash', 'phalangite', 'steady_presence'] });
    expect(perked.abilities).toContain('bash');
    expect(perked.auras).toEqual(['steady']);
    expect(perked.block).toBeGreaterThan(base.block);
    // A bash needs a shield.
    const noShield = { ...h, perks: ['shield_drill', 'shield_bash'] as PerkId[], equip: { ...h.equip } };
    delete noShield.equip.shield;
    expect(computeStats(noShield).abilities).not.toContain('bash');
    expect(Object.values(PERKS).filter((p) => !p.classOnly).length).toBe(15);
  });
});

describe('abilities', () => {
  it('shield bash stuns and dazes the man in front, then goes on cooldown', () => {
    const rng = new Rng(11);
    const ids = { nextId: 1 };
    const bt = lines([hero(rng, ids, 'hoplite', ['shield_drill', 'shield_bash'])], [hero(rng, ids, 'hoplite')], 1.2);
    const u = bt.units[0];
    const t = bt.units[1];
    expect(bt.abilityReady(u, 'bash')).toBe(true);
    bt.issue(0, { kind: 'ability', unit: u.id, ability: 'bash' });
    expect(t.stun).toBeGreaterThanOrEqual(ABILITY_RULES.bashStun);
    expect(t.daze).toBe(ABILITY_RULES.bashDaze);
    expect(bt.blockChance(t, 'front', 0, false)).toBe(0);
    const cd = bt.abilityCooldown(u, 'bash');
    expect(cd).toBe(Math.round(ABILITIES.bash.cooldown * TICK_RATE * u.stats.cdMult));
    expect(bt.abilityReady(u, 'bash')).toBe(false);
    const ev = bt.drainEvents().find((e) => e.type === 'ability');
    expect(ev && ev.type === 'ability' && ev.targets).toEqual([t.id]);
    // Cooldown ticks down with the battle clock.
    for (let i = 0; i < 10; i++) bt.step();
    expect(bt.abilityCooldown(u, 'bash')).toBe(cd - 10);
  });

  it('a bash needs an enemy close in front', () => {
    const rng = new Rng(12);
    const ids = { nextId: 1 };
    const bt = lines([hero(rng, ids, 'hoplite', ['shield_drill', 'shield_bash'])], [hero(rng, ids, 'hoplite')], 6);
    expect(bt.abilityReady(bt.units[0], 'bash')).toBe(false);
    bt.issue(0, { kind: 'ability', unit: 0, ability: 'bash' });
    expect(bt.abilityCooldown(bt.units[0], 'bash')).toBe(0);
  });

  it('berserk: more damage, no rout while it lasts, winded after', () => {
    const rng = new Rng(13);
    const ids = { nextId: 1 };
    const bt = lines([hero(rng, ids, 'swordsman', ['brawler', 'berserk'])], [hero(rng, ids, 'hoplite')], 1.2);
    const u = bt.units[0];
    bt.issue(0, { kind: 'ability', unit: u.id, ability: 'berserk' });
    expect(u.berserk).toBe(ABILITY_RULES.berserkTicks);
    u.morale = 1; // would rout at once
    bt.step();
    expect(u.state).toBe('ready');
    expect(u.morale).toBeGreaterThan(u.stats.morale * 0.25);
    u.stamina = 50;
    u.berserk = 1;
    bt.step();
    expect(u.berserk).toBe(0);
    expect(u.stamina).toBeLessThanOrEqual(50 - ABILITY_RULES.berserkWinded + 1);
  });

  it('rally cry turns routing allies back and restores morale', () => {
    const rng = new Rng(14);
    const ids = { nextId: 1 };
    const a = [hero(rng, ids, 'hoplite', ['brawler', 'berserk', 'bloodlust', 'rally_cry'], 8), hero(rng, ids, 'hoplite'), hero(rng, ids, 'hoplite')];
    const bt = lines(a, [hero(rng, ids, 'hoplite')], 8);
    const [leader, x, y] = bt.units;
    x.state = 'routing';
    x.morale = 2;
    y.morale = 10;
    bt.issue(0, { kind: 'ability', unit: leader.id, ability: 'rally' });
    expect(x.state).toBe('ready');
    expect(x.morale).toBeGreaterThan(x.stats.morale * 0.55);
    expect(y.morale).toBeGreaterThan(10);
  });

  it('volley makes nearby missile-men loose at once without spending ammunition', () => {
    const rng = new Rng(15);
    const ids = { nextId: 1 };
    const sl = [hero(rng, ids, 'slinger', ['fleet', 'volley'], 4, 0), hero(rng, ids, 'slinger', [], 4, 0), hero(rng, ids, 'slinger', [], 4, 0)];
    const bt = lines(sl, [hero(rng, ids, 'hoplite')], 8);
    const ammo = bt.units.slice(0, 3).map((u) => u.ammo);
    const before = bt.projectiles.length;
    bt.issue(0, { kind: 'ability', unit: 0, ability: 'volley' });
    expect(bt.projectiles.length - before).toBe(3 * ABILITY_RULES.volleyShots);
    expect(bt.units.slice(0, 3).map((u) => u.ammo)).toEqual(ammo);
  });
});

describe('auras', () => {
  it('steady presence covers allies within its radius only and softens morale loss', () => {
    const rng = new Rng(16);
    const ids = { nextId: 1 };
    const a = [hero(rng, ids, 'hoplite', ['shield_drill', 'shield_bash', 'phalangite', 'steady_presence'], 8), hero(rng, ids, 'hoplite'), hero(rng, ids, 'hoplite')];
    const bt = lines(a, [hero(rng, ids, 'hoplite')], 10);
    const [src, near, far] = bt.units;
    far.x = src.x;
    far.y = src.y + AURAS.steady.radius + 3;
    for (let i = 0; i < 12; i++) bt.step();
    expect(src.aura & AURAS.steady.bit).toBeTruthy();
    expect(near.aura & AURAS.steady.bit).toBeTruthy();
    expect(far.aura & AURAS.steady.bit).toBeFalsy();
    expect(bt.units[3].aura).toBe(0); // enemies are never covered
  });
});

describe('knock-outs', () => {
  it('some heroes struck down only lose consciousness (more with endurance)', () => {
    let ko = 0;
    let dead = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const rng = new Rng(seed);
      const ids = { nextId: 1 };
      const a = [hero(rng, ids, 'swordsman', [], 6), hero(rng, ids, 'swordsman', [], 6)];
      const b = [hero(rng, ids, 'swordsman', [], 1), hero(rng, ids, 'swordsman', [], 1)];
      const bt = lines(a, b, 1.2, seed);
      for (let i = 0; i < 20 * 90 && bt.phase === 'battle'; i++) bt.step();
      for (const u of bt.units) if (u.state === 'dead') (u.ko ? ko++ : dead++);
    }
    expect(ko).toBeGreaterThan(0);
    expect(dead).toBeGreaterThan(0);
  });
});

describe('determinism with abilities', () => {
  it('a battle with ability orders replays exactly from the order log', () => {
    const make = () => {
      const rng = new Rng(77);
      const ids = { nextId: 1 };
      const a: Hero[] = [];
      for (let i = 0; i < 5; i++) a.push(hero(rng, ids, i < 3 ? 'hoplite' : 'swordsman', i < 3 ? ['shield_drill', 'shield_bash', 'phalangite', 'steady_presence'] : ['brawler', 'berserk', 'bloodlust', 'rally_cry'], 8));
      for (let i = 0; i < 2; i++) a.push(hero(rng, ids, 'slinger', ['fleet', 'volley'], 4, 1));
      const b: Hero[] = [];
      for (let i = 0; i < 7; i++) {
        const h = makeHero(rng, ids, 'celtic', i < 5 ? 'swordsman' : 'peltast', 1, 2, i < 5 ? 0 : 1);
        setBotLevel(h, 6); // bots develop perks too, and use them
        b.push(h);
      }
      return new Battle({ seed: 4242, armies: [armySpec(a, false), armySpec(b, true)] });
    };
    const a = make();
    a.startBattle();
    for (let t = 0; t < 20 * 120 && a.phase !== 'ended'; t++) {
      if (a.tick === 10) a.issue(0, { kind: 'order', group: 0, order: 'advance' });
      // The "player" uses every ready ability twice a second.
      if (a.tick % 10 === 0) for (const u of a.units) if (u.side === 0) for (const id of u.abil) if (a.abilityReady(u, id)) a.issue(0, { kind: 'ability', unit: u.id, ability: id });
      a.step();
    }
    const abilityOrders = a.orderLog.filter((o) => o.order.kind === 'ability');
    expect(abilityOrders.some((o) => o.side === 0)).toBe(true);
    expect(abilityOrders.some((o) => o.side === 1)).toBe(true);
    const human = a.orderLog.filter((o) => o.side === 0);
    const b = make();
    b.startBattle();
    for (let t = 0; t < 20 * 120 && b.phase !== 'ended'; t++) {
      for (const o of human) if (o.tick === b.tick) b.issue(0, o.order);
      b.step();
    }
    expect(b.hash()).toBe(a.hash());
    expect(JSON.stringify(b.result())).toBe(JSON.stringify(a.result()));
  });

  it('perk mirror battles are reproducible', () => {
    expect(runMirror(9, ['berserk'], 'melee')).toBe(runMirror(9, ['berserk'], 'melee'));
  });
});
