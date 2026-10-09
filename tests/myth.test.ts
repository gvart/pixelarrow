import { describe, expect, it } from 'vitest';
import { Battle, TICK_RATE } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import { armySpec } from '../src/game/armySpec';
import { makeHero } from '../src/game/heroes';
import { ENCOUNTER_IDS, MYTHS, mythHeroes, encounterOf, type EncounterId } from '../src/data/beasts';
import { applyBattleConsumable } from '../src/data/consumables';
import { computeStats } from '../src/sim/stats';
import { beastLevelFor } from '../src/game/beasts';
import { runBeast } from '../src/dev/beastBalance';
import type { ClassId } from '../src/data/classes';
import type { Hero } from '../src/data/units';
import type { LoggedOrder, SimEvent, SimUnit } from '../src/sim/types';

function men(cls: ClassId, n: number, group = 0, level = 4, seed = 3): Hero[] {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const out: Hero[] = [];
  for (let i = 0; i < n; i++) out.push(makeHero(rng, ids, 'greek', cls, level, 2, group, out));
  return out;
}

/** Men (side 0, no bot) against a beast (side 1, its own AI), in battle. */
function fight(army: Hero[], enc: EncounterId, level = 4, seed = 11, bot0 = false): Battle {
  const b = new Battle({ seed, armies: [armySpec(army, bot0), armySpec(mythHeroes(enc, level), true)], timeLimit: 600 });
  b.startBattle();
  return b;
}

function run(b: Battle, secs: number, each?: (e: SimEvent) => void): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < secs * TICK_RATE && b.phase === 'battle'; i++) {
    b.step();
    for (const e of b.drainEvents()) {
      all.push(e);
      each?.(e);
    }
  }
  return all;
}

/** Stand side 0's group 0 at a spot (its formation too, so the men stay there). */
function formAt(b: Battle, cx: number, cy: number, frontage: number, type: 'line' | 'shieldwall' | 'column' = 'line', fy = -1): SimUnit[] {
  b.issue(0, { kind: 'form', group: 0, cx, cy, fx: 0, fy, frontage, type });
  const mem = b.activeMembers(0);
  for (const u of mem) {
    const p = b.slotPos(u);
    place(u, p.x, p.y, 0, fy);
  }
  return mem;
}

const acts = (ev: SimEvent[], act: string) => ev.filter((e) => e.type === 'myth' && e.act === act);
const beast = (b: Battle, id: string) => b.units.find((u) => u.stats.boss === id)!;
const place = (u: SimUnit, x: number, y: number, fx = 0, fy = -1) => {
  u.x = x;
  u.y = y;
  u.fx = fx;
  u.fy = fy;
};

describe('mythical beasts: data', () => {
  it('every encounter builds its beast army with boss stats', () => {
    for (const enc of ENCOUNTER_IDS) {
      const heroes = mythHeroes(enc, 4);
      expect(heroes.length).toBeGreaterThan(0);
      expect(encounterOf(heroes)).toBe(enc);
      for (const h of heroes) {
        const s = computeStats(h);
        expect(s.boss).toBe(h.cls);
        expect(s.kind).toBe('animal');
        expect(MYTHS[s.boss as keyof typeof MYTHS]).toBeTruthy();
      }
    }
    expect(mythHeroes('hydra', 4).filter((h) => h.cls === 'hydra_head')).toHaveLength(5);
    expect(mythHeroes('harpies', 4).every((h) => h.cls === 'harpy')).toBe(true);
  });

  it('big beasts dominate the field: footprints from the beast table', () => {
    const b = fight(men('hoplite', 4), 'cyclops');
    expect(beast(b, 'cyclops').rad).toBe(MYTHS.cyclops.radius);
    expect(b.big).toBe(true);
    expect(b.myth).not.toBeNull();
  });
});

describe('mythical beasts: determinism', () => {
  for (const enc of ENCOUNTER_IDS) {
    it(`${enc}: the same setup and orders replay to the same state`, () => {
      const mk = () => fight(men('hoplite', 4, 0).concat(men('archer', 3, 1, 4, 9)), enc, 4, 77);
      const a = mk();
      a.issue(0, { kind: 'order', group: 0, order: 'charge' });
      run(a, 8);
      a.issue(0, { kind: 'shieldwall', group: 0, on: true });
      run(a, 20);
      const log: LoggedOrder[] = a.orderLog.filter((o) => o.side === 0);
      const c = mk();
      let next = 0;
      for (let i = 0; i < 28 * TICK_RATE && c.phase === 'battle'; i++) {
        while (next < log.length && log[next].tick === c.tick) c.issue(0, log[next++].order);
        c.step();
        c.drainEvents();
      }
      expect(c.tick).toBe(a.tick);
      expect(c.hash()).toBe(a.hash());
    });
  }

  it('a full bot battle against every beast ends the same way twice', () => {
    for (const enc of ['hydra', 'cyclops', 'harpies', 'nemean_lion', 'minotaur', 'chimera'] as const) {
      const x = runBeast(enc, 'good', 4242);
      const y = runBeast(enc, 'good', 4242);
      expect(y).toEqual(x);
    }
  });
});

describe('the hydra', () => {
  it('a severed head grows back unless the body is struck at once', () => {
    const b = fight(men('hoplite', 1), 'hydra');
    const hydra = beast(b, 'hydra');
    const man = b.units[0];
    place(man, 2, 34); // far away: nobody strikes anything
    const head = b.units.find((u) => u.stats.boss === 'hydra_head')!;
    head.hp = 1;
    const ev: SimEvent[] = [];
    b.applyDamage(head, man, 50, 'front', false, 1);
    expect(head.state).toBe('dead');
    ev.push(...b.drainEvents());
    expect(acts(ev, 'sever')).toHaveLength(1);
    const more = run(b, MYTHS.hydra.sp.regrow! + 1);
    expect(acts(more, 'regrow')).toHaveLength(1);
    expect(head.state).toBe('ready');
    // again, but a blade on the body seals the stump
    head.hp = 1;
    b.applyDamage(head, man, 50, 'front', false, 1);
    b.applyDamage(hydra, man, 5, 'side', false, 1);
    const sealed = b.drainEvents();
    expect(acts(sealed, 'seal')).toHaveLength(1);
    run(b, MYTHS.hydra.sp.regrow! + 2);
    expect(head.state).toBe('dead');
  });

  it('arrows do not seal a stump, and the body shrugs off most of them', () => {
    const b = fight(men('archer', 1, 1), 'hydra');
    const hydra = beast(b, 'hydra');
    const man = b.units[0];
    place(man, 2, 34);
    const head = b.units.find((u) => u.stats.boss === 'hydra_head')!;
    b.applyDamage(head, man, 999, 'front', false, 1);
    const hp0 = hydra.hp;
    b.applyDamage(hydra, man, 10, 'side', true, 1);
    expect(acts(b.drainEvents(), 'seal')).toHaveLength(0);
    expect(hp0 - hydra.hp).toBeLessThan(10 * 0.34 * 0.5);
  });

  it('killing the body kills every head', () => {
    const b = fight(men('hoplite', 1), 'hydra');
    const hydra = beast(b, 'hydra');
    b.applyDamage(hydra, b.units[0], 1e6, 'rear', false, 1);
    expect(b.units.filter((u) => u.side === 1).every((u) => u.state === 'dead')).toBe(true);
    b.step();
    expect(b.winner).toBe(0);
  });

  it('heads stay arranged in front of the body as it turns and walks', () => {
    const b = fight(men('hoplite', 6), 'hydra');
    run(b, 6);
    const hydra = beast(b, 'hydra');
    for (const h of b.units.filter((u) => u.stats.boss === 'hydra_head' && u.state === 'ready')) {
      const d = Math.hypot(h.x - hydra.x, h.y - hydra.y);
      expect(d).toBeGreaterThan(1);
      expect(d).toBeLessThan(3.2);
      expect((h.x - hydra.x) * hydra.fx + (h.y - hydra.y) * hydra.fy).toBeGreaterThan(0);
    }
  });
});

describe('the cyclops', () => {
  it('a boulder scatters a tight block of men: shoved apart, stunned, shaken', () => {
    const army = men('hoplite', 9);
    const b = fight(army, 'cyclops');
    const cy = beast(b, 'cyclops');
    place(cy, 12, 6, 0, 1);
    // a packed 3x3 block 9 paces away
    const block = formAt(b, 12, 15, 3, 'shieldwall');
    const spread = () => {
      const cx = block.reduce((a, u) => a + u.x, 0) / block.length;
      const cyy = block.reduce((a, u) => a + u.y, 0) / block.length;
      return block.reduce((a, u) => a + Math.hypot(u.x - cx, u.y - cyy), 0) / block.length;
    };
    const s0 = spread();
    const m0 = block.reduce((a, u) => a + u.morale, 0);
    let landed: SimEvent | null = null;
    run(b, 12, (e) => {
      if (!landed && e.type === 'myth' && e.act === 'boulder') landed = e;
    });
    expect(landed).not.toBeNull();
    const hit = (landed as unknown as { targets: number[] }).targets;
    expect(hit.length).toBeGreaterThanOrEqual(3);
    expect(spread()).toBeGreaterThan(s0);
    expect(block.reduce((a, u) => a + u.morale, 0)).toBeLessThan(m0);
  });

  it('stamps on men who crowd him', () => {
    const b = fight(men('hoplite', 6), 'cyclops');
    const cy = beast(b, 'cyclops');
    place(cy, 12, 12, 0, 1);
    b.units.filter((u) => u.side === 0).forEach((u, i) => place(u, 12 + [1.2, -1.2, 0, 0, 0.9, -0.9][i], 12 + [0, 0, 1.2, -1.2, 0.9, 0.9][i]));
    const ev = run(b, MYTHS.cyclops.sp.stompCd!);
    expect(acts(ev, 'stomp').length).toBeGreaterThan(0);
  });
});

describe('harpies', () => {
  it('circle out of reach, then dive on missile-men behind the line', () => {
    const army = [...men('hoplite', 6, 0), ...men('archer', 3, 1, 4, 5)];
    const b = fight(army, 'harpies');
    const harpy = beast(b, 'harpy');
    run(b, 0.5);
    expect(b.myth!.vis(harpy)).toBe(0);
    let dive: SimEvent | null = null;
    run(b, 12, (e) => {
      if (!dive && e.type === 'myth' && e.act === 'dive') dive = e;
    });
    expect(dive).not.toBeNull();
    const prey = b.units[(dive as unknown as { targets: number[] }).targets[0]];
    expect(prey.stats.role).not.toBe('melee');
  });

  it('a diving harpy takes extra damage from missiles', () => {
    const b = fight(men('archer', 1, 1), 'harpies');
    const h = beast(b, 'harpy');
    const st = b.myth!.get(h)!;
    st.mode = 1;
    const hp0 = h.hp;
    b.applyDamage(h, b.units[0], 10, 'front', true, 1);
    const diving = hp0 - h.hp;
    st.mode = 2;
    const hp1 = h.hp;
    b.applyDamage(h, b.units[0], 10, 'front', false, 1);
    expect(diving).toBeGreaterThan((hp1 - h.hp) * 1.3);
  });
});

describe('the Nemean lion', () => {
  it('arrows, javelins and stones bounce off; blades bite', () => {
    const b = fight(men('archer', 1, 1), 'nemean_lion');
    const lion = beast(b, 'nemean_lion');
    const hp0 = lion.hp;
    b.applyDamage(lion, b.units[0], 50, 'front', true, 1);
    expect(lion.hp).toBe(hp0);
    expect(acts(b.drainEvents(), 'immune')).toHaveLength(1);
    b.applyDamage(lion, b.units[0], 50, 'front', false, 1);
    expect(lion.hp).toBeLessThan(hp0);
  });

  it('pounces on a man standing alone', () => {
    const army = men('hoplite', 5);
    const b = fight(army, 'nemean_lion');
    const lion = beast(b, 'nemean_lion');
    place(lion, 12, 10, 0, 1);
    const mine = b.units.filter((u) => u.side === 0);
    mine.slice(0, 4).forEach((u, i) => place(u, 4 + i * 0.7, 30));
    place(mine[4], 15, 14);
    let p: SimEvent | null = null;
    run(b, 8, (e) => {
      if (!p && e.type === 'myth' && e.act === 'pounce') p = e;
    });
    expect(p).not.toBeNull();
    expect((p as unknown as { targets: number[] }).targets[0]).toBe(mine[4].id);
  });
});

describe('the minotaur', () => {
  it('charges through loose men and tramples them', () => {
    const b = fight(men('peltast', 6, 0), 'minotaur');
    const mino = beast(b, 'minotaur');
    place(mino, 12, 6, 0, 1);
    formAt(b, 12, 13, 3, 'line');
    const ev = run(b, 10);
    expect(acts(ev, 'charge').length).toBeGreaterThan(0);
    expect(acts(ev, 'trample').length).toBeGreaterThan(0);
  });

  it('a braced spear wall stops the charge and stuns the bull', () => {
    const army = men('hoplite', 6);
    const b = fight(army, 'minotaur');
    const mino = beast(b, 'minotaur');
    formAt(b, 12, 14, 6, 'shieldwall');
    place(mino, 12, 6, 0, 1);
    b.myth!.get(mino)!.cd[0] = 0;
    const ev = run(b, 8);
    expect(acts(ev, 'balk').length).toBeGreaterThan(0);
  });

  it('rages when badly wounded', () => {
    const b = fight(men('hoplite', 1), 'minotaur');
    const mino = beast(b, 'minotaur');
    place(b.units[0], 2, 34);
    mino.hp = mino.stats.maxHp * 0.2;
    const ev = run(b, 0.5);
    expect(acts(ev, 'enrage')).toHaveLength(1);
    expect(b.myth!.get(mino)!.enraged).toBe(true);
  });
});

describe('the chimera', () => {
  it('breathes fire over a cone of men and sets them burning', () => {
    const b = fight(men('militia', 6), 'chimera');
    const ch = beast(b, 'chimera');
    place(ch, 12, 10, 0, 1);
    formAt(b, 12, 13.2, 3, 'column');
    let breath: SimEvent | null = null;
    run(b, 10, (e) => {
      if (!breath && e.type === 'myth' && e.act === 'breath') breath = e;
    });
    expect(breath).not.toBeNull();
    expect((breath as unknown as { targets: number[] }).targets.length).toBeGreaterThanOrEqual(2);
  });

  it('the serpent tail strikes a man behind it', () => {
    const b = fight(men('hoplite', 1), 'chimera');
    const ch = beast(b, 'chimera');
    place(ch, 12, 12, 0, 1);
    formAt(b, 12, 10.6, 1, 'line', 1);
    b.myth!.get(ch)!.cd[2] = 0;
    const ev = run(b, 0.5);
    expect(acts(ev, 'tail').length).toBeGreaterThan(0);
  });
});

describe('terror', () => {
  it('a beast saps the nerve of men near it; Will resists', () => {
    const weak = men('militia', 1)[0];
    const strong = men('militia', 1, 0, 4, 99)[0];
    weak.attrs.wil = 3;
    strong.attrs.wil = 10;
    const b = fight([weak, strong], 'cyclops');
    const cy = beast(b, 'cyclops');
    place(cy, 12, 12, 0, 1);
    const [w, s] = b.units.filter((u) => u.side === 0);
    place(w, 9.5, 12);
    place(s, 14.5, 12);
    b.myth!.get(cy)!.cd = [999, 999, 999];
    w.morale = s.morale = 50;
    b.myth!.afterMove.call(b.myth);
    // run a few half seconds of the aura only (the giant stays put)
    for (let i = 0; i < 40; i++) {
      b.tick++;
      b.myth!.afterMove();
    }
    expect(50 - w.morale).toBeGreaterThan(50 - s.morale);
    expect(s.morale).toBeLessThan(50);
  });
});

describe('the war horn', () => {
  it('rallies the whole army once, even men already running', () => {
    const army = men('militia', 4);
    const spec = armySpec(army, false);
    applyBattleConsumable(spec, 'war_horn');
    expect(spec.horn).toBe(1);
    const b = new Battle({ seed: 3, armies: [spec, armySpec(men('hoplite', 2, 0, 4, 8), true)] });
    b.startBattle();
    const mine = b.units.filter((u) => u.side === 0);
    mine[0].state = 'routing';
    mine[1].morale = 5;
    b.issue(0, { kind: 'horn' });
    expect(mine[0].state).toBe('ready');
    expect(mine[1].morale).toBeGreaterThan(5);
    expect(b.horns[0]).toBe(0);
    const ev = b.drainEvents();
    expect(ev.filter((e) => e.type === 'horn')).toHaveLength(1);
    mine[0].state = 'routing';
    b.issue(0, { kind: 'horn' });
    expect(mine[0].state).toBe('routing');
  });

  it('no horn, no rally (and old setups ignore the order)', () => {
    const b = new Battle({ seed: 3, armies: [armySpec(men('militia', 2), false), armySpec(men('hoplite', 2), true)] });
    b.startBattle();
    const h0 = b.hash();
    b.units[0].state = 'routing';
    b.issue(0, { kind: 'horn' });
    expect(b.units[0].state).toBe('routing');
    b.units[0].state = 'ready';
    expect(b.hash()).toBe(h0);
  });
});

describe('world bosses carry their wounds', () => {
  it('a kraken segment starts from its stored HP; severed arms stay gone', () => {
    const heroes = mythHeroes('kraken', 8);
    const spec = armySpec(heroes, true);
    spec.units[0].hp0 = 1234;
    spec.units[1].hp0 = 0;
    const b = new Battle({ seed: 5, armies: [armySpec(men('hoplite', 4), false), spec], timeLimit: 120 });
    b.startBattle();
    expect(b.units.find((u) => u.stats.boss === 'kraken')!.hp).toBe(1234);
    const arm = b.units.filter((u) => u.stats.boss === 'kraken_arm')[0];
    expect(arm.state).toBe('dead');
    run(b, 25);
    expect(arm.state).toBe('dead');
  });
});

describe('beast hoards', () => {
  it('a slain beast drops its hoard: rare or better gear, the only regular Legendary source', async () => {
    const { beastArmy, bandBeast } = await import('../src/game/beasts');
    const { lootPool } = await import('../src/game/loot');
    const rarities = new Set<string>();
    for (let s = 1; s <= 60; s++) {
      const heroes = beastArmy('cyclops', 4, new Rng(s), { nextId: 1 }, 2);
      const items = Object.values(heroes[0].equip).filter(Boolean);
      expect(items).toHaveLength(2);
      for (const it of items) {
        expect(['rare', 'epic', 'legendary']).toContain(it!.rarity);
        rarities.add(it!.rarity);
      }
    }
    expect(rarities.has('legendary')).toBe(true);
    // the hoard is in the loot of a battle in which the beast was slain
    const heroes = beastArmy('minotaur', 4, new Rng(3), { nextId: 1 }, 2);
    const pool = lootPool({ winner: 0, ticks: 1, units: [{ heroId: heroes[0].id, side: 1, state: 'dead', kills: 0, killedBy: 0, ko: false, hp: 0, maxHp: 1, wear: { weapon: 0, shield: 0, helmet: 0, armor: 0 } }] }, heroes);
    expect(pool).toHaveLength(2);
    // a few of the overland bands are beasts
    const n = Array.from({ length: 1400 }, (_, i) => bandBeast(i)).filter(Boolean).length;
    expect(n).toBeGreaterThan(60);
    expect(n).toBeLessThan(160);
  });
});

describe('beast level', () => {
  it('is a little above the army average, more for a world boss, never below 2', () => {
    const army = [{ level: 3 }, { level: 5 }];
    expect(beastLevelFor('hydra', army)).toBe(5);
    expect(beastLevelFor('titan', army)).toBe(7);
    expect(beastLevelFor('hydra', [])).toBe(2);
  });
});
