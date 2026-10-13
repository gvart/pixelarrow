/**
 * AB-02: the seven signature actives (design/gdd/abilities.md R3), the bot's
 * use of them (R6) and the re-tuned four (R2). Each active has a unit test, a
 * bot-use test and a replay check; server/test/activesReplay.test.ts replays a
 * client battle that uses all seven.
 */
import { describe, expect, it } from 'vitest';
import { Battle, TICK_RATE } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import { armySpec } from '../src/game/armySpec';
import { classSquad } from '../src/dev/classBalance';
import { CLASSES, type ClassId } from '../src/data/classes';
import { ABILITIES, ABILITY_IDS, ABILITY_RULES, AURA_RULES, AURAS, MAX_MEDALLIONS, PERKS, rankMedallions, type AbilityId, type PerkId } from '../src/data/perks';
import { botPathChoice } from '../src/game/heroes';
import type { Hero } from '../src/data/units';
import type { Side, SimEvent, SimUnit } from '../src/sim/types';

const SIGNATURE: AbilityId[] = ['push', 'bond', 'warcry', 'sunder', 'aimed', 'recharge', 'scythe'];

/** n men of a class at a level, with exactly these perks. */
function men(rng: Rng, ids: { nextId: number }, cls: ClassId, n: number, perks: PerkId[], group = 0, level = 4): Hero[] {
  const out = classSquad(rng, ids, cls, n, level, group);
  for (const h of out) h.perks = [...perks];
  return out;
}

/** Two groups facing each other across the field's middle at a gap (battle phase; bots as given). */
function face(a: Hero[], b: Hero[], gap = 1.2, opts: { seed?: number; botA?: boolean; botB?: boolean; wallB?: boolean } = {}): Battle {
  const bt = new Battle({ seed: opts.seed ?? 5, armies: [armySpec(a, opts.botA ?? false), armySpec(b, opts.botB ?? false)], timeLimit: 600 });
  bt.startBattle();
  const place = (side: Side, cy: number, fy: number) => {
    for (const g of bt.sideGroups(side)) {
      const mem = bt.activeMembers(g.id);
      if (mem.length === 0) continue;
      bt.issue(side, { kind: 'form', group: g.id, cx: 12, cy, fx: 0, fy, frontage: mem.length, type: side === 1 && opts.wallB ? 'shieldwall' : undefined });
      for (const u of mem) {
        const p = bt.slotPos(u);
        u.x = p.x;
        u.y = p.y;
        u.fx = 0;
        u.fy = fy;
      }
    }
  };
  place(0, 18 + gap / 2, -1);
  place(1, 18 - gap / 2, 1);
  return bt;
}

function abilityEvents(events: SimEvent[], id: AbilityId): Extract<SimEvent, { type: 'ability' }>[] {
  return events.filter((e): e is Extract<SimEvent, { type: 'ability' }> => e.type === 'ability' && e.ability === id);
}

/** Step a bot battle until an event of this ability shows up from `side` (or the time runs out). */
function botUses(bt: Battle, id: AbilityId, side: Side, ticks = 20 * 120): boolean {
  for (let i = 0; i < ticks && bt.phase !== 'ended'; i++) {
    bt.step();
    if (abilityEvents(bt.drainEvents(), id).some((e) => bt.units[e.unit].side === side)) return true;
  }
  return false;
}

describe('signature active data (abilities.md R3)', () => {
  it('eleven abilities; every cooldown is at least 12 s (anti-pillar)', () => {
    expect(ABILITY_IDS).toEqual(['bash', 'volley', 'berserk', 'rally', ...SIGNATURE]);
    for (const id of ABILITY_IDS) expect(ABILITIES[id].cooldown, id).toBeGreaterThanOrEqual(12);
    expect(ABILITIES.bond.groupMode).toBe('one');
    expect(ABILITIES.warcry.groupMode).toBe('one');
    expect(ABILITIES.aimed.groupMode).toBe('one');
    expect(ABILITIES.recharge.groupMode).toBe('one');
  });

  it('each family signature perk grants its active; bots develop path A for now (V5-056)', () => {
    for (const id of SIGNATURE) expect(PERKS[id as PerkId].ability).toBe(id);
    for (const c of Object.values(CLASSES)) {
      if (c.tree.length < 2) continue;
      expect(botPathChoice(c.tree[1], 1), c.id).toBe(c.tree[1][0]);
    }
  });

  it('medallion budget (R4): at most 3 shown, ranked ready, then holders, then the shortest cooldown', () => {
    expect(MAX_MEDALLIONS).toBe(3);
    const order = rankMedallions([
      { id: 'rally', ready: true, holders: 1 },
      { id: 'push', ready: false, holders: 6 },
      { id: 'bash', ready: true, holders: 4 },
      { id: 'warcry', ready: true, holders: 4 },
      { id: 'sunder', ready: true, holders: 4 },
    ]);
    // ready first; among four holders bash (12 s) before sunder (30 s) before war-cry (40 s)
    expect(order).toEqual(['bash', 'sunder', 'warcry', 'rally', 'push']);
    expect(order.slice(0, MAX_MEDALLIONS)).toEqual(['bash', 'sunder', 'warcry']);
  });

  it('the four re-tuned actives and three auras carry the R2 magnitudes', () => {
    expect(ABILITY_RULES.bashDaze).toBe(50); // 2.5 s
    expect(ABILITY_RULES.dazeDamage).toBe(1.25);
    expect(ABILITY_RULES.volleyShots).toBe(2); // R2's 3 shots, stacked per man, broke the beast lairs (V5-056)
    expect(ABILITY_RULES.rallyMorale).toBe(0.4);
    expect(AURA_RULES.eagleAccuracy).toBe(0.15);
    expect(AURA_RULES.eagleDamage).toBe(1.3);
    expect(AURAS.eagle.radius).toBe(6);
    expect(AURA_RULES.warlordDamage).toBe(1.15);
  });
});

describe('Push of Pike', () => {
  it('shoves the foe in front back, staggers him (no blow, half block) and shakes him', () => {
    const rng = new Rng(1);
    const ids = { nextId: 1 };
    const bt = face(men(rng, ids, 'hoplite', 1, ['shield_drill', 'push']), men(rng, ids, 'hoplite', 1, []));
    const [u, t] = bt.units;
    u.engaged = true;
    const block = bt.blockChance(t, 'front', 0, false);
    const d0 = Math.hypot(t.x - u.x, t.y - u.y);
    const m0 = t.morale;
    expect(bt.abilityReady(u, 'push')).toBe(true);
    bt.issue(0, { kind: 'ability', unit: u.id, ability: 'push' });
    expect(Math.hypot(t.x - u.x, t.y - u.y)).toBeCloseTo(d0 + ABILITY_RULES.pushShove, 5);
    expect(t.cooldown).toBeGreaterThanOrEqual(ABILITY_RULES.pushStagger);
    expect(bt.blockChance(t, 'front', 0, false)).toBeCloseTo(block * ABILITY_RULES.pushBlock, 5);
    expect(t.morale).toBeCloseTo(m0 - ABILITY_RULES.pushMorale * bt.ml(t), 5);
    expect(bt.abilityCooldown(u, 'push')).toBe(Math.round(ABILITIES.push.cooldown * TICK_RATE * u.stats.cdMult));
    for (let i = 0; i < ABILITY_RULES.pushStagger; i++) bt.step();
    expect(bt.blockChance(t, 'front', 0, false)).toBeGreaterThan(block * ABILITY_RULES.pushBlock);
  });

  it('has no effect on a braced shield wall, nor on a horse, nor out of melee', () => {
    const rng = new Rng(2);
    const ids = { nextId: 1 };
    const wall = face(men(rng, ids, 'hoplite', 1, ['push']), men(rng, ids, 'hoplite', 2, []), 1.2, { wallB: true });
    wall.units[0].engaged = true;
    expect(wall.abilityReady(wall.units[0], 'push')).toBe(false);
    const horse = face(men(rng, ids, 'hoplite', 1, ['push']), men(rng, ids, 'companion', 1, []), 1.6);
    horse.units[0].engaged = true;
    expect(horse.abilityReady(horse.units[0], 'push')).toBe(false);
    const apart = face(men(rng, ids, 'hoplite', 1, ['push']), men(rng, ids, 'hoplite', 1, []), 6);
    expect(apart.abilityReady(apart.units[0], 'push')).toBe(false);
  });

  it('a bot pushes in frontal melee', () => {
    const rng = new Rng(3);
    const ids = { nextId: 1 };
    const bt = face(men(rng, ids, 'hoplite', 4, ['shield_drill', 'push']), men(rng, ids, 'celt_sword', 4, []), 1.2, { botA: true });
    expect(botUses(bt, 'push', 0, 200)).toBe(true);
  });
});

describe('Sunder', () => {
  it('the man in front loses his block and armour for a while', () => {
    const rng = new Rng(4);
    const ids = { nextId: 1 };
    const bt = face(men(rng, ids, 'falx', 1, ['brawler', 'sunder']), men(rng, ids, 'hoplite', 1, []));
    const [u, t] = bt.units;
    expect(bt.blockChance(t, 'front', 0, false)).toBeGreaterThan(0);
    const hit = (b: Battle) => {
      const hp = t.hp;
      b.applyDamage(t, u, 10, 'front', false, 1);
      return hp - t.hp;
    };
    const before = hit(bt);
    bt.issue(0, { kind: 'ability', unit: u.id, ability: 'sunder' });
    expect(bt.blockChance(t, 'front', 0, false)).toBe(0);
    expect(hit(bt)).toBeGreaterThan(before);
    for (let i = 0; i < ABILITY_RULES.sunderTicks; i++) {
      t.stun = 1; // keep him still and alive for the check
      bt.step();
    }
    expect(bt.blockChance(t, 'front', 0, false)).toBeGreaterThan(0);
  });

  it('a bot sunders in melee', () => {
    const rng = new Rng(5);
    const ids = { nextId: 1 };
    const bt = face(men(rng, ids, 'falx', 4, ['brawler', 'sunder']), men(rng, ids, 'hoplite', 4, []), 1.2, { botA: true });
    expect(botUses(bt, 'sunder', 0, 400)).toBe(true);
  });
});

describe('Sacred Bond', () => {
  it('needs a second bonded man within 4 paces', () => {
    const rng = new Rng(6);
    const ids = { nextId: 1 };
    const one = face(men(rng, ids, 'sacred_band', 1, ['bond']), men(rng, ids, 'hoplite', 1, []));
    expect(one.abilityReady(one.units[0], 'bond')).toBe(false);
    const two = face(men(rng, ids, 'sacred_band', 2, ['bond']), men(rng, ids, 'hoplite', 1, []));
    expect(two.abilityReady(two.units[0], 'bond')).toBe(true);
  });

  it('F1: morale damage is split among the bonded men (the total is kept), and a bonded man holds while the bond averages above the rout line', () => {
    const rng = new Rng(7);
    const ids = { nextId: 1 };
    const bt = face(men(rng, ids, 'sacred_band', 4, ['bond']), men(rng, ids, 'hoplite', 1, []), 8);
    const bonded = bt.units.filter((u) => u.side === 0);
    const foe = bt.units.find((u) => u.side === 1)!;
    bt.issue(0, { kind: 'ability', unit: bonded[0].id, ability: 'bond' });
    // the group's other holders wait out the cooldown (groupMode 'one')
    for (const u of bonded) expect(bt.abilityCooldown(u, 'bond')).toBeGreaterThan(0);
    const total = () => bonded.reduce((a, u) => a + u.morale, 0);
    const m0 = bonded.map((u) => u.morale);
    const t0 = total();
    bt.applyDamage(bonded[0], foe, 10, 'front', false, 1);
    const lost = m0.map((m, i) => m - bonded[i].morale);
    expect(lost[1]).toBeGreaterThan(0);
    expect(lost[1]).toBeCloseTo(lost[2], 5);
    expect(lost[0]).toBeCloseTo(lost[1], 5);
    // control: the same blow on an unbonded man costs him the whole sum
    const ctl = face(men(new Rng(7), { nextId: 1 }, 'sacred_band', 4, ['bond']), men(new Rng(7), { nextId: 9 }, 'hoplite', 1, []), 8);
    const c0 = ctl.units[0].morale;
    ctl.applyDamage(ctl.units[0], ctl.units[4], 10, 'front', false, 1);
    expect(t0 - total()).toBeCloseTo(c0 - ctl.units[0].morale, 5);
    // a man far below the line holds while his mates keep the average up
    bonded[0].morale = 1;
    bt.step();
    expect(bonded[0].state).toBe('ready');
    // ... and breaks once the bond is over
    for (let i = 0; i < ABILITY_RULES.bondTicks && bonded[0].state === 'ready'; i++) {
      bonded[0].morale = 1;
      bt.step();
    }
    expect(bonded[0].state).toBe('routing');
  });

  it('a bot binds its men when the group is in melee and its nerve goes (share below 0.6)', () => {
    const rng = new Rng(8);
    const ids = { nextId: 1 };
    const bt = face(men(rng, ids, 'sacred_band', 4, ['bond']), men(rng, ids, 'hoplite', 4, []), 1.2, { botA: true });
    for (const u of bt.units) if (u.side === 0) u.morale = u.stats.morale * 0.5;
    expect(botUses(bt, 'bond', 0, 40)).toBe(true);
  });
});

describe('War-cry', () => {
  it('shakes the enemy in front (x1.5 out of a shield wall) and puts the group on one cooldown', () => {
    const rng = new Rng(9);
    const ids = { nextId: 1 };
    const bt = face(men(rng, ids, 'gallic', 3, ['brawler', 'warcry']), men(rng, ids, 'hoplite', 3, []), 3);
    const foes = bt.units.filter((u) => u.side === 1);
    const m0 = foes.map((e) => e.morale);
    const u = bt.units[0];
    expect(bt.abilityReady(u, 'warcry')).toBe(true);
    bt.issue(0, { kind: 'ability', unit: u.id, ability: 'warcry' });
    foes.forEach((e, i) => expect(e.morale).toBeCloseTo(m0[i] - ABILITY_RULES.warcryMorale * ABILITY_RULES.warcryOpen * bt.ml(e), 5));
    for (const a of bt.units.filter((x) => x.side === 0)) expect(bt.abilityReady(a, 'warcry')).toBe(false);
    // in a shield wall the cry is weaker
    const r2 = new Rng(9);
    const i2 = { nextId: 1 };
    const wall = face(men(r2, i2, 'gallic', 1, ['warcry']), men(r2, i2, 'hoplite', 3, []), 3, { wallB: true });
    const w = wall.units.find((x) => x.side === 1)!;
    const w0 = w.morale;
    wall.issue(0, { kind: 'ability', unit: 0, ability: 'warcry' });
    expect(w.morale).toBeCloseTo(w0 - ABILITY_RULES.warcryMorale * wall.ml(w), 5);
  });

  it('needs an enemy within 5 paces in front', () => {
    const rng = new Rng(10);
    const ids = { nextId: 1 };
    const bt = face(men(rng, ids, 'gallic', 1, ['warcry']), men(rng, ids, 'hoplite', 1, []), 8);
    expect(bt.abilityReady(bt.units[0], 'warcry')).toBe(false);
  });

  it('a bot cries at contact', () => {
    const rng = new Rng(11);
    const ids = { nextId: 1 };
    const bt = face(men(rng, ids, 'gallic', 4, ['brawler', 'warcry']), men(rng, ids, 'hoplite', 4, []), 1.2, { botA: true });
    expect(botUses(bt, 'warcry', 0, 200)).toBe(true);
  });
});

describe('Aimed Volley', () => {
  it('needs a focus; every shooter in range looses aimedShots free, careful shots at the focused group', () => {
    const rng = new Rng(12);
    const ids = { nextId: 1 };
    const bt = face(men(rng, ids, 'archer', 3, ['longshot', 'aimed']), men(rng, ids, 'hoplite', 3, []), 6);
    const u = bt.units[0];
    expect(bt.abilityReady(u, 'aimed')).toBe(false); // no focus
    const target = bt.units.find((x) => x.side === 1)!.group;
    bt.issue(0, { kind: 'focus', group: u.group, target });
    expect(bt.abilityReady(u, 'aimed')).toBe(true);
    const ammo = bt.units.filter((x) => x.side === 0).map((x) => x.ammo);
    bt.drainEvents();
    bt.issue(0, { kind: 'ability', unit: u.id, ability: 'aimed' });
    const ev = bt.drainEvents();
    expect(ev.filter((e) => e.type === 'shot').length).toBe(3 * ABILITY_RULES.aimedShots);
    expect(bt.units.filter((x) => x.side === 0).map((x) => x.ammo)).toEqual(ammo);
    expect(abilityEvents(ev, 'aimed')[0].targets.length).toBe(3);
  });

  it('a bot with 2 shooters in range focuses a group for the volley, then clears the focus', () => {
    const rng = new Rng(13);
    const ids = { nextId: 1 };
    const bt = face(men(rng, ids, 'archer', 3, ['longshot', 'aimed']), men(rng, ids, 'hoplite', 3, []), 6, { botA: true });
    expect(botUses(bt, 'aimed', 0, 40)).toBe(true);
    const g = bt.groups[bt.units[0].group];
    expect(g.focus ?? -1).toBe(-1);
    expect(bt.orderLog.some((o) => o.side === 0 && o.order.kind === 'focus' && o.order.target >= 0)).toBe(true);
  });
});

describe('Wheel and Re-charge', () => {
  it('the riders break off at once, ride back and regroup for 2 s; no free blows land on them meanwhile', () => {
    const rng = new Rng(14);
    const ids = { nextId: 1 };
    const bt = face(men(rng, ids, 'companion', 2, ['horsemanship', 'recharge']), men(rng, ids, 'hoplite', 3, []), 1.6);
    const riders = bt.units.filter((u) => u.side === 0);
    for (const r of riders) r.engaged = true;
    const g = bt.groups[riders[0].group];
    const cy = g.formation.cy;
    expect(bt.abilityReady(riders[0], 'recharge')).toBe(true);
    bt.issue(0, { kind: 'ability', unit: riders[0].id, ability: 'recharge' });
    expect(g.order).toBe('fallback');
    expect(g.formation.cy).toBeGreaterThan(cy + ABILITY_RULES.rechargeBack * 0.5); // away from the foe (side 0 faces -y)
    expect(riders.every((r) => !r.engaged)).toBe(true);
    expect(bt.regrouping(g.id)).toBe(true);
    expect(bt.abilityReady(riders[1], 'recharge')).toBe(false);
    const hp = riders.map((r) => r.hp);
    for (let i = 0; i < ABILITY_RULES.rechargeRegroup - 1; i++) bt.step();
    expect(riders.map((r) => r.hp)).toEqual(hp);
    bt.step();
    expect(bt.regrouping(g.id)).toBe(false);
  });

  it('needs riders in melee or within 6 paces of an enemy', () => {
    const rng = new Rng(15);
    const ids = { nextId: 1 };
    const far = face(men(rng, ids, 'companion', 1, ['recharge']), men(rng, ids, 'hoplite', 1, []), 12);
    expect(far.abilityReady(far.units[0], 'recharge')).toBe(false);
    const foot = face(men(rng, ids, 'hoplite', 1, ['recharge']), men(rng, ids, 'hoplite', 1, []), 1.2);
    expect(foot.abilityReady(foot.units[0], 'recharge')).toBe(false);
  });

  it('bot riders locked in melee wheel and re-charge', () => {
    const rng = new Rng(16);
    const ids = { nextId: 1 };
    let used = false;
    for (let seed = 1; seed <= 6 && !used; seed++) {
      const a = [...men(rng, ids, 'hoplite', 6, ['shield_drill']), ...men(rng, ids, 'companion', 2, ['horsemanship', 'recharge'], 3)];
      const b = men(rng, ids, 'hoplite', 9, ['shield_drill']);
      const bt = new Battle({ seed, armies: [armySpec(a, true), armySpec(b, true)] });
      bt.startBattle();
      used = botUses(bt, 'recharge', 0, bt.timeLimitTicks);
    }
    expect(used).toBe(true);
  });
});

describe('Scythe Run', () => {
  /** A chariot 2 paces before a line of n men (not braced unless asked), facing them. */
  function run(n: number, wall = false): { bt: Battle; ch: SimUnit } {
    const rng = new Rng(17);
    const ids = { nextId: 1 };
    const bt = face(men(rng, ids, 'chariot', 1, ['horsemanship', 'scythe']), men(rng, ids, 'hoplite', n, []), 2.5, { wallB: wall });
    return { bt, ch: bt.units[0] };
  }

  it('drives 6 paces on; every enemy beside the path is cut once and shaken', () => {
    const { bt, ch } = run(3);
    const foes = bt.units.filter((u) => u.side === 1);
    const near = foes.filter((e) => Math.abs(e.x - ch.x) <= ABILITY_RULES.scytheWidth + e.rad);
    expect(near.length).toBeGreaterThan(0);
    const hp = near.map((e) => e.hp);
    const y0 = ch.y;
    expect(bt.abilityReady(ch, 'scythe')).toBe(true);
    bt.issue(0, { kind: 'ability', unit: ch.id, ability: 'scythe' });
    expect(bt.abilityReady(ch, 'scythe')).toBe(false);
    for (let i = 0; i < 60; i++) bt.step();
    expect(y0 - ch.y).toBeGreaterThan(ABILITY_RULES.scytheRun * 0.6);
    near.forEach((e, i) => expect(e.hp, `man ${e.id}`).toBeLessThan(hp[i]));
  });

  it('braced spears stop the run with a balk; the path must stay on the field', () => {
    const { bt, ch } = run(3, true);
    bt.issue(0, { kind: 'ability', unit: ch.id, ability: 'scythe' });
    let balked = false;
    for (let i = 0; i < 40 && !balked; i++) {
      bt.step();
      balked = ch.stun > 0;
    }
    expect(balked).toBe(true);
    const edge = run(1);
    edge.ch.y = 3;
    expect(edge.bt.abilityReady(edge.ch, 'scythe')).toBe(false);
  });

  it('a bot chariot runs at 3 or more men in its path', () => {
    const rng = new Rng(18);
    const ids = { nextId: 1 };
    let used = false;
    for (let seed = 1; seed <= 6 && !used; seed++) {
      const bt = new Battle({ seed, armies: [armySpec(men(rng, ids, 'chariot', 3, ['horsemanship', 'scythe'], 3), true), armySpec(men(rng, ids, 'militia', 13, ['drilled']), true)] });
      bt.startBattle();
      for (let i = 0; i < bt.timeLimitTicks && bt.phase !== 'ended' && !used; i++) {
        // the rule: a run starts only with 3 or more in the path
        const ready = bt.units.filter((u) => u.side === 0 && bt.abilityReady(u, 'scythe')).map((u) => bt.scytheVictims(u));
        bt.step();
        if (abilityEvents(bt.drainEvents(), 'scythe').length > 0) {
          used = true;
          expect(Math.max(...ready)).toBeGreaterThanOrEqual(3);
        }
      }
    }
    expect(used).toBe(true);
  });
});

describe('determinism with the signature actives', () => {
  /** Both sides bot-driven, every family at level 4 holding its tier-2 active (bots use what they hold, R6). */
  function mixed(seed: number): Battle {
    const rng = new Rng(seed);
    const ids = { nextId: 1 };
    const side = (): Hero[] => [
      ...men(rng, ids, 'hoplite', 3, ['shield_drill', 'push'], 0), ...men(rng, ids, 'sacred_band', 2, ['shield_drill', 'bond'], 0),
      ...men(rng, ids, 'archer', 3, ['longshot', 'aimed'], 1),
      ...men(rng, ids, 'gallic', 2, ['brawler', 'warcry'], 2), ...men(rng, ids, 'falx', 2, ['brawler', 'sunder'], 2),
      ...men(rng, ids, 'companion', 2, ['horsemanship', 'recharge'], 3), ...men(rng, ids, 'chariot', 1, ['horsemanship', 'scythe'], 3),
    ];
    return new Battle({ seed, armies: [armySpec(side(), true), armySpec(side(), true)] });
  }

  it('a bot battle using the actives runs to the same hash twice, and the actives fire', () => {
    const play = () => {
      const bt = mixed(4321);
      bt.startBattle();
      const used = new Set<AbilityId>();
      for (let i = 0; i < bt.timeLimitTicks + 10 && bt.phase !== 'ended'; i++) {
        bt.step();
        for (const e of bt.drainEvents()) if (e.type === 'ability') used.add(e.ability);
      }
      return { hash: bt.hash(), used, result: JSON.stringify(bt.result()) };
    };
    const a = play();
    const b = play();
    expect(b.hash).toBe(a.hash);
    expect(b.result).toBe(a.result);
    for (const id of ['push', 'warcry', 'sunder', 'aimed'] as AbilityId[]) expect(a.used.has(id), id).toBe(true);
  });

  it('a human side using every active replays exactly from its order log', () => {
    const make = () => {
      const rng = new Rng(99);
      const ids = { nextId: 1 };
      const mine = [
        ...men(rng, ids, 'hoplite', 3, ['shield_drill', 'push'], 0), ...men(rng, ids, 'sacred_band', 2, ['shield_drill', 'bond'], 0),
        ...men(rng, ids, 'archer', 3, ['longshot', 'aimed'], 1),
        ...men(rng, ids, 'gallic', 2, ['brawler', 'warcry'], 2), ...men(rng, ids, 'falx', 2, ['brawler', 'sunder'], 2),
        ...men(rng, ids, 'companion', 2, ['horsemanship', 'recharge'], 3), ...men(rng, ids, 'chariot', 1, ['horsemanship', 'scythe'], 3),
      ];
      const theirs = [...classSquad(rng, ids, 'hoplite', 8, 4, 0), ...classSquad(rng, ids, 'slinger', 3, 4, 1), ...classSquad(rng, ids, 'celt_sword', 4, 4, 2)];
      return new Battle({ seed: 2024, armies: [armySpec(mine, false), armySpec(theirs, true)] });
    };
    const a = make();
    a.startBattle();
    const used = new Set<AbilityId>();
    for (let t = 0; t < a.timeLimitTicks + 10 && a.phase !== 'ended'; t++) {
      if (a.tick === 1) {
        a.issue(0, { kind: 'focus', group: 1, target: 4 });
        for (const g of [0, 2, 3]) a.issue(0, { kind: 'order', group: g, order: 'charge' });
        a.issue(0, { kind: 'order', group: 1, order: 'advance' });
      }
      if (a.tick % 10 === 0) for (const u of a.units) if (u.side === 0) for (const id of u.abil) if (a.abilityReady(u, id)) a.issue(0, { kind: 'ability', unit: u.id, ability: id });
      a.step();
      for (const e of a.drainEvents()) if (e.type === 'ability' && a.units[e.unit].side === 0) used.add(e.ability);
    }
    for (const id of SIGNATURE) expect(used.has(id), id).toBe(true);
    const human = a.orderLog.filter((o) => o.side === 0);
    const b = make();
    b.startBattle();
    for (let t = 0; t < b.timeLimitTicks + 10 && b.phase !== 'ended'; t++) {
      for (const o of human) if (o.tick === b.tick) b.issue(0, o.order);
      b.step();
    }
    expect(b.hash()).toBe(a.hash());
    expect(JSON.stringify(b.result())).toBe(JSON.stringify(a.result()));
  });
});
