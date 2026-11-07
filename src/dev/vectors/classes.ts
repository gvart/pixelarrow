/**
 * A person's war stats (src/war/sim/classes.ts warStatsOf, withPerks; src/data/warPerks.ts perkFx) and a chief's loot
 * (src/data/warBosses.ts chiefLoot), for the C++ stats.h and war_wild.h (godot/tests/sim/test_classes.gd). The persons are
 * makePerson's of every class (and an unknown one) at levels, kit tiers and rarities, then worked over: odd gear from any
 * class (shortfalls, gear blockers, sets), stored and rolled affixes and powers, legacy and junk rarities, quality and
 * condition, traits, skills and honours; each under no path and every path at a level. And the paths' caps and
 * manRefusal (src/war/world/start.ts) over paths, families, levels, classes and what a player has.
 */
import { Rng } from '../../sim/rng';
import { CIV_CLASSES, CLASSES } from '../../data/classes';
import { AFFIXES, POWER_IDS } from '../../data/affixes';
import { ITEMS, SLOTS, type Item } from '../../data/items';
import { TRAITS } from '../../data/traits';
import { WAR_CHIEFS, CHIEF_KINDS } from '../../data/warWild';
import { chiefLoot } from '../../data/warBosses';
import { perkFx, type PerkPath } from '../../data/warPerks';
import type { HonourStat, WarPerson, WarSkillId } from '../../war/types';
import { makePerson } from '../../war/sim/roster';
import { cartCap, FAMILY_IDS, manRefusal, mayHold, PATH_IDS, soldierCap, workerCap, type PlayerPath } from '../../war/world/start';
import { SKILLS } from '../../war/sim/skills';
import { warStatsOf, withPerks } from '../../war/sim/classes';

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'fine', 'heroic', 'junk'];
const PATHS: (PerkPath | '')[] = ['', 'warrior', 'builder', 'trader'];
const HONOURS: HonourStat[] = ['hp', 'dmg', 'armor', 'block', 'accuracy'];
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** WarStats as the C++ probe gives it: knock, work and breach only when set. */
const statsOf = (p: WarPerson, path: PerkPath | '', level: number) => {
  const s: Record<string, unknown> = { ...withPerks(warStatsOf(p), perkFx(path || null, level)) };
  for (const k of ['knock', 'work', 'breach']) if (s[k] === undefined || (k === 'knock' && !s[k])) delete s[k];
  return s;
};

export const vectors = () => {
  const r = new Rng(8086);
  const defs = Object.keys(ITEMS), affs = Object.keys(AFFIXES), traits = Object.keys(TRAITS), skills = Object.keys(SKILLS) as WarSkillId[];
  const classes = [...Object.keys(CLASSES), ...Object.keys(CIV_CLASSES), 'nope'];
  const persons: unknown[] = [];
  for (const cls of classes) for (let k = 0; k < 10; k++) {
    const id = `c${persons.length}`;
    const p = makePerson(id, cls, { level: r.int(1, 15), tier: r.int(0, 2), rarity: r.pick(RARITIES.slice(0, 5)) as Item['rarity'], ...(r.chance(0.5) ? { skills: Array.from({ length: r.int(0, 4) }, () => r.pick(skills)) } : {}) });
    const h = p.hero;
    if (k >= 2) {
      // odd gear: any item in its slot, rolled or stored affixes and powers, any rarity, quality, condition
      for (const slot of SLOTS) if (r.chance(0.5)) {
        const pool = defs.filter((d) => ITEMS[d].slot === slot);
        if (!pool.length) continue;
        const it: Item = { uid: `${id}-${slot}-x`, def: r.pick(pool), rarity: r.pick(RARITIES) as Item['rarity'], cond: r.chance(0.5) ? 100 : r.int(0, 100) };
        if (r.chance(0.4)) it.aff = Array.from({ length: r.int(1, 3) }, () => `${r.pick(affs)}:${r.int(0, 6)}`).join(',');
        if (r.chance(0.3)) it.pow = r.chance(0.8) ? r.pick(POWER_IDS) : 'nonsense';
        if (r.chance(0.5)) it.q = r.int(0, 2) as 0 | 1 | 2;
        h.equip[slot] = it;
      } else if (r.chance(0.15)) delete h.equip[slot];
      if (r.chance(0.6)) h.traits = Array.from({ length: r.int(0, 3) }, () => r.pick(traits)) as typeof h.traits;
      if (r.chance(0.4)) p.honours = Array.from({ length: r.int(1, 5) }, (_, i) => ({ name: `Honour ${i}`, stat: r.pick(HONOURS) }));
    }
    const path = r.pick(PATHS), level = r.int(1, 13);
    persons.push({ person: clone(p), path, level, stats: statsOf(p, path, level), bare: statsOf(p, '', 1) });
  }
  const perks = PATHS.flatMap((path) => Array.from({ length: 14 }, (_, level) => [path, level, perkFx(path || null, level)]));
  const loot: unknown[] = [];
  for (const c of [...WAR_CHIEFS, { id: 'nobody' }]) for (const depth of [0, 1, 2, 3, 4]) for (let k = 0; k < 4; k++) {
    const seed = `moors:${k}:${depth}:${r.int(0, 99999)}`;
    const l = chiefLoot(c.id, depth, seed);
    loot.push([c.id, depth, seed, Object.entries(l.goods), l.item ? [l.item.def, l.item.rarity] : null]);
  }
  // the paths' limits and who may join whom (start.ts)
  const caps = [null, ...PATH_IDS].map((p) => [p ?? '', soldierCap(p), workerCap(p), cartCap(p)]);
  const refusals: unknown[] = [];
  const ps: PlayerPath[] = [{ path: null, family: null }, ...PATH_IDS.flatMap((path) => [null, ...FAMILY_IDS].flatMap((family) => [undefined, 1, 4, 6, 9].map((level) => ({ path, family, ...(level ? { level } : {}) }))))];
  for (const p of ps) for (const cls of classes) for (const [soldiers, workers] of [[0, 0], [3, 2], [4, 6], [12, 3], [11, 5]])
    refusals.push([p, cls, soldiers, workers, manRefusal(p, cls, { soldiers, workers }) ?? '', mayHold(p, cls)]);
  return { persons, perks, loot, kinds: Object.keys(CHIEF_KINDS), caps, refusals };
};
