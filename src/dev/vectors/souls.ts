/**
 * Souls (src/war/sim/souls.ts) on real regions: the sites of each region, spawn rolls (calm and in storms, with and
 * without a town's chance multiplier), falls that make old battlefields, claims by one side, contests, the wild taking
 * a soul, refusals by the gate, joins that fail, fading, named souls with a bar, and the root moved to a fresh souls.
 * Every host call is recorded with its answer (the Godot side answers from them in order); a step is written for each
 * tick of the claim scan that did something, with the men when they moved and the snaps now and then.
 */
import { Rng } from '../../sim/rng';
import { parseRegion } from '../../war/region/schema';
import { MOB_TEAM } from '../../war/sim/mobs';
import { SOUL, SOUL_CLASSES, SOUL_LEVEL, SOUL_LEVEL_MAX, createSouls, soulLevel, soulSites, type SoulHost, type SoulMan } from '../../war/sim/souls';
import type { RegionData, WarPerson } from '../../war/types';

const regionFiles = import.meta.glob('../../war/regions/*.json', { eager: true, import: 'default' });
const load = (id: string): RegionData => parseRegion(regionFiles[`../../war/regions/${id}.json`]);
const regionIds = Object.keys(regionFiles).map((p) => p.replace(/^.*\/|\.json$/g, '')).sort();

const CLS = ['militia', 'hoplite', 'celt_sword', 'archer', 'slinger', 'javelineer', 'falx', 'peltast'];
const person = (k: number, rng: Rng): WarPerson =>
  ({ id: `pp${k}`, hero: { name: `Name ${k}`, level: rng.int(1, 9), ...(rng.chance(0.8) ? { cls: rng.pick(CLS) } : {}) } }) as unknown as WarPerson;

function soulsOn(id: string, seed: number, chanceAt: boolean, T: number) {
  const region = load(id), rng = new Rng(seed);
  let calls: unknown[] = [], men: SoulMan[] = [], k = 0;
  const host: SoulHost = {
    men: () => men,
    gate(owner, cls) {
      const g = rng.chance(0.75) ? { ok: true, have: rng.int(0, 20) } : { ok: false, have: rng.int(5, 30), ...(rng.chance(0.75) ? { why: rng.pick(['family', 'locked', 'full', 'household'] as const) } : {}) };
      calls.push(['gate', owner, cls, g]);
      return g;
    },
    join(s, squad) {
      const j = rng.chance(0.85) ? { unit: 1000 + k, person: person(k++, rng) } : null;
      calls.push(['join', s.id, squad, j]);
      return j;
    },
    stop: (owner, soul) => void calls.push(['stop', owner, soul]),
    emit: (e) => void calls.push(['emit', e]),
    ...(chanceAt ? { chanceAt(x: number, y: number) { const c = rng.pick([1, 1.25, 2, 0.5, 3]); calls.push(['chanceAt', x, y, c]); return c; } } : {}),
  };
  let souls = createSouls(region, seed, host);
  const sites = souls.sites();
  const steps: unknown[] = [];
  // falls cluster round a few points (some make battlefields), named souls come back
  const fallAt = Array.from({ length: 8 }, () => [rng.range(20, region.w - 20), rng.range(20, region.h - 20)]);
  const named: WarPerson[] = Array.from({ length: 4 }, () => person(500 + k++, rng));
  for (let t = 0; t <= T; t++) {
    if (t % SOUL.scan) {
      souls.tick(t);
      continue;
    }
    const step: Record<string, unknown> = { t };
    const ops: unknown[] = [];
    // the men move round the waiting souls
    if (t % 25 === 0) {
      men = [];
      for (const s of souls.snaps(t)) {
        const near = () => ({ x: s.x + rng.range(-2, 2), y: s.y + rng.range(-2, 2) });
        const roll = rng.next();
        if (roll < 0.25) continue; // nobody
        const claimA = rng.chance(0.85) ? s.id : rng.chance(0.5) ? -1 : s.id + 1;
        men.push({ ...near(), team: 0, squad: rng.pick([3, 2]), claim: claimA, owner: 'p:a', civ: rng.chance(0.08) });
        if (rng.chance(0.5)) men.push({ ...near(), team: 0, squad: rng.pick([3, 2, 4]), claim: claimA, owner: 'p:a', civ: false });
        if (roll > 0.75) men.push({ ...near(), team: 1, squad: 5, claim: s.id, owner: 'p:b', civ: false });
        if (roll > 0.6 && roll < 0.7) men.push({ ...near(), team: MOB_TEAM, squad: 9, claim: -1, owner: '', civ: false });
        if (roll > 0.9) men.length = 0, men.push({ ...near(), team: MOB_TEAM, squad: 9, claim: -1, owner: '', civ: false });
        if (rng.chance(0.2)) men.push({ x: s.x + 10, y: s.y, team: 1, squad: 6, claim: s.id, owner: 'p:b', civ: false });
      }
      step.men = men.map((m) => ({ ...m }));
    }
    if (rng.chance(0.08)) {
      const [fx, fy] = fallAt[rng.int(0, fallAt.length - 1)];
      for (let i = rng.int(1, 4); i > 0; i--) {
        const x = fx + rng.range(-3, 3), y = fy + rng.range(-3, 3), cls = rng.pick([...CLS, 'civ_smith', 'mob_wolf']);
        souls.fell(x, y, cls);
        ops.push(['fell', x, y, cls]);
      }
    }
    if (rng.chance(0.01)) {
      const x = rng.range(10, region.w - 10), y = rng.range(10, region.h - 10), cls = rng.pick(CLS), level = rng.int(1, 6), site = rng.pick(['shrine', 'ruin', 'battlefield', 'lair'] as const);
      ops.push(['spawn', x, y, cls, level, site, souls.spawn(x, y, cls, level, site, t)]);
    }
    if (rng.chance(0.006)) {
      const p = rng.pick(named), life = rng.pick([0, 400, 3000]), bar = rng.chance(0.6) ? { owner: 'p:a', ticks: rng.pick([100, 1000]) } : null;
      ops.push(['spawnNamed', p, life, bar, souls.spawnNamed(p, t, life, bar ?? undefined)]);
    }
    if (rng.chance(0.004)) {
      const s = rng.pick([1, 1, 2, 3, 0.5]);
      souls.setStorm(s);
      ops.push(['storm', s]);
    }
    if (rng.chance(0.002)) {
      const root = souls.saveRoot();
      souls = createSouls(region, seed + 1, host);
      souls.loadRoot(root);
      ops.push(['reload']);
    }
    calls = [];
    souls.tick(t);
    if (ops.length) step.ops = ops;
    if (calls.length) step.calls = calls;
    if (t % 100 === 0 || calls.length || ops.length) {
      step.snaps = souls.snaps(t);
      step.any = souls.any();
      const ids = [0, 1, 2, rng.int(0, 40)];
      step.get = ids.map((i) => structuredClone(souls.get(i) ?? null)); // a copy: the soul lives on
    }
    if (Object.keys(step).length > 1) steps.push(step);
  }
  return { region: id, seed, chanceAt, T, sites, end: souls.sites(), steps };
}

export const vectors = () => {
  const lv: unknown[] = [];
  for (const site of ['shrine', 'ruin', 'battlefield', 'lair'] as const) for (let d = 0; d <= 4; d++) lv.push([site, d, soulLevel(site, d)]);
  return {
    soul: SOUL, classes: SOUL_CLASSES, level: SOUL_LEVEL, levelMax: SOUL_LEVEL_MAX, levels: lv,
    sites: regionIds.map((id) => [id, soulSites(load(id))]),
    runs: [['dodona', 1, false], ['kyrene-e', 2, true], ['krios', 3, false], ['elaia', 4, true], ['skythia-n', 5, true], ['test-ridge', 6, false], ['siren', 0x9e3779b9, true], ['ammon', 8, false]]
      .map(([id, seed, c]) => soulsOn(id as string, seed as number, c as boolean, 9000)),
  };
};
