/**
 * M7h landmark balance (docs/WAR.md "Living regions" -> "Balance"; docs/impl/global-war-rebuild.md M7h): headless guardian
 * fights on the real region JSON, and the depth effort-vs-reward, landmark score and rare-good flow tables that
 * `npm run balance:war` prints after the crafting report. Deterministic: fixed seeds, fixed raids.
 *
 * A raid is squads of 12 well-equipped men (level 6, tier-2 kit, rare) of mixed classes from one point outside the
 * landmark, each attack-moving on the guardian's body every 10 s; it wins when the guardian falls (`bossSlain`) within
 * the limit, loses when every man is down, the guardian escapes, or time runs out.
 */
import { createSim } from '../war/sim';
import { MOB_TEAM } from '../war/sim/mobs';
import { parseRegion } from '../war/region/schema';
import { makePerson } from '../war/sim/roster';
import type { RegionData, WarBuildSim } from '../war/types';
import { DEPTH, HOST } from '../war/sim/depth';
import { GUARDIANS } from '../war/sim/bosses';
import { WAR_BOSSES, bossGoods } from '../data/warBosses';
import { LANDMARKS, RARE_NODE, RARE_NODES, type RareGood } from '../data/warLandmarks';
import { GATES, HEGEMONY, SCORE } from '../war/world/season';

const files = import.meta.glob('../war/regions/*.json', { eager: true, import: 'default' });
const cache = new Map<string, RegionData>();
export const regionOf = (id: string): RegionData => {
  if (!cache.has(id)) cache.set(id, parseRegion(files[`../war/regions/${id}.json`]));
  return cache.get(id)!;
};

/** A raid: its squads' classes (12 men each) and where it starts. */
export interface Raid { label: string; classes: readonly string[] }
/** Where each landmark's raid forms up, outside its walls (tiles). */
export const STAGING: Readonly<Record<string, readonly [number, number]>> = {
  krios: [316, 371],
  ammon: [330, 350],
  saddle: [257, 290],
  gorge: [262, 190],
  canyons: [163, 196],
  erymanthos: [162, 410],
};
/** Mixed raid of n squads: a line of heavies, then missiles, then lights. */
const MIX = ['hoplite', 'archer', 'celt_sword', 'slinger', 'peltast', 'archer', 'thureophoros', 'javelineer', 'hoplite', 'archer'];
export const mixed = (n: number): Raid => ({ label: `${n} squads`, classes: MIX.slice(0, n) });

export interface RaidResult { won: boolean; secs: number; men: number; lost: number; bossHp: number; escaped: boolean }

const TICKS_PER_SEC = 10;
const RANGED = new Set(['archer', 'slinger', 'javelineer']);
export const LIMIT_SECS = 20 * 60;

/**
 * One headless fight: the raid against guardian `boss` of `region`, seed `seed`, at most `limitSecs` of game time. Every
 * 10 s: missiles hold back while Drakon is on the ground (ammo is the only answer to his roof) and melee stands off while
 * he is up; heavies break the landmark's nearest shut gate unless the guardian is within 8 tiles; a host's streets are
 * fought through where the raid stands. `by` tallies the raid's falls by killer class ('move': a special move).
 */
export function raidFight(region: string, boss: string, raid: Raid, seed: number, limitSecs = LIMIT_SECS, by?: Record<string, number>): RaidResult {
  const r = regionOf(region);
  const sim: WarBuildSim = createSim(r, seed);
  sim.spawnMobs();
  sim.step();
  const g = r.guardians!.find((x) => x.boss === boss)!;
  const [sx, sy] = STAGING[region] ?? [g.x, g.y + 20];
  const mine: number[] = [];
  raid.classes.forEach((cls, k) => {
    const ps = Array.from({ length: 12 }, (_, i) => makePerson(`r${seed}-${k}-${i}`, cls, { level: 6, tier: 1, rarity: 'rare' }));
    const off = (k - (raid.classes.length - 1) / 2) * 5;
    mine.push(sim.spawnSquad(`p${k % 3}`, 0, cls, 12, sx + off, sy + (k % 2) * 4, ps));
  });
  const men = mine.length * 12;
  const host = (r.lairs ?? []).some((l) => l.captain); // a host holds the streets: fight through them
  let won = false, escaped = false, t = 0;
  const limit = limitSecs * TICKS_PER_SEC;
  for (; t < limit && !won && !escaped; t++) {
    if (t % 100 === 0) {
      const b = sim.snapshot().bosses!.find((x) => x.id === boss)!;
      // the heavies break the landmark's nearest shut gate first, the missiles shoot the guardian
      const gate = (sim.snapshot().buildings ?? [])
        .filter((x) => x.landmark && x.type === 'stoneGate' && x.state !== 'destroyed' && x.team !== 0 && Math.hypot(x.x - sx, x.y - sy) < 30)
        .sort((p, q) => Math.hypot(p.x - sx, p.y - sy) - Math.hypot(q.x - sx, q.y - sy))[0];
      mine.forEach((s, k) => {
        const ranged = RANGED.has(raid.classes[k]);
        const aloft = b.state === 'perch' || b.state === 'flight';
        // near the guardian, or (a host) any of the mob team within 6 tiles: fight there before the gate
        const near = (!aloft && centre(sim, s, b.x, b.y) < 8) || (host && foesNear(sim, s, 6));
        // missiles are kept for a guardian out of melee reach (ammo is the raid's only answer to a roof); melee
        // stands off out of the breath while he is up there
        if (b.id === 'drakon' && (ranged ? !aloft && b.phase === 0 : aloft)) sim.order({ kind: 'move', squad: s, x: sx + (k - mine.length / 2) * 3, y: sy + 6 });
        else if (gate && !ranged && !near && !host) sim.order({ kind: 'attackBuilding', squad: s, building: gate.id });
        else if (host && near) sim.order({ kind: 'attackMove', squad: s, ...xy(sim, s) });
        else if (host || t < 300) sim.order({ kind: 'attackMove', squad: s, x: b.x, y: b.y });
        else sim.order({ kind: 'attack', squad: s, target: b.squad });
      });
    }
    sim.step();
    for (const e of sim.events()) {
      if (e.kind === 'bossSlain' && e.boss === boss) won = true;
      if (e.kind === 'bossFled' && e.boss === boss) escaped = true;
      if (e.kind === 'fall' && by && mine.includes(sim.snapshot().units[e.unit].squad)) {
        const u = e.by >= 0 ? sim.snapshot().units[e.by] : undefined;
        const k = !u ? 'move' : mine.includes(u.squad) ? 'own' : u.cls;
        by[k] = (by[k] ?? 0) + 1;
      }
    }
    if (t % 50 === 0 && aliveOf(sim, mine) === 0) break;
  }
  const b = sim.snapshot().bosses!.find((x) => x.id === boss)!;
  const left = aliveOf(sim, mine);
  return { won, secs: Math.round(t / TICKS_PER_SEC), men, lost: men - left, bossHp: won ? 0 : b.maxHp > 0 ? b.hp / b.maxHp : 0, escaped };
}

/** Distance from a squad's living men (their mean) to (x,y). */
const centre = (sim: WarBuildSim, s: number, x: number, y: number): number => {
  const sn = sim.snapshot(), us = sn.squads[s].units.map((u) => sn.units[u]).filter((u) => u.state !== 'dead');
  if (!us.length) return Infinity;
  return Math.hypot(us.reduce((a, u) => a + u.x, 0) / us.length - x, us.reduce((a, u) => a + u.y, 0) / us.length - y);
};
const foesNear = (sim: WarBuildSim, s: number, r: number): boolean => {
  const sn = sim.snapshot(), us = sn.squads[s].units.map((u) => sn.units[u]).filter((u) => u.state !== 'dead');
  return sn.units.some((m) => m.state !== 'dead' && sn.squads[m.squad]?.team === MOB_TEAM && us.some((u) => Math.hypot(u.x - m.x, u.y - m.y) < r));
};
const xy = (sim: WarBuildSim, s: number): { x: number; y: number } => {
  const sn = sim.snapshot(), us = sn.squads[s].units.map((u) => sn.units[u]).filter((u) => u.state !== 'dead');
  return { x: us.reduce((a, u) => a + u.x, 0) / Math.max(1, us.length), y: us.reduce((a, u) => a + u.y, 0) / Math.max(1, us.length) };
};
/** Living men of the squads. */
const aliveOf = (sim: WarBuildSim, squads: number[]): number => {
  const snap = sim.snapshot();
  return squads.reduce((a, s) => a + snap.squads[s].units.filter((u) => snap.units[u].state !== 'dead').length, 0);
};

/** The raids the report fights: per guardian, its region, the raid sizes (squads) and seeds. */
export const FIGHTS: readonly { boss: string; region: string; squads: readonly number[]; seeds: readonly number[] }[] = [
  { boss: 'drakon', region: 'krios', squads: [1, 4, 5, 6], seeds: [1, 2, 3] },
  { boss: 'bandit_king', region: 'ammon', squads: [2, 3], seeds: [1, 2, 3] },
  { boss: 'brontes', region: 'saddle', squads: [1, 4], seeds: [1, 2] },
  { boss: 'gyges', region: 'gorge', squads: [1, 4], seeds: [1, 2] },
  { boss: 'chimera', region: 'canyons', squads: [1, 4], seeds: [1, 2] },
  { boss: 'grove_queen', region: 'erymanthos', squads: [1, 4], seeds: [1, 2] },
];

/** Raid to take a region of each depth (docs/WAR.md "Living regions" -> "Balance"). */
const RAID_TO_TAKE = ['owned', '1 squad', '2-3 squads', '4 squads', '4-6 squads'];
const DAY_H = 24;
const pad = (s: string | number, n: number) => String(s).padEnd(n);
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Depth effort vs reward: claim, mobs, yield, score a day, rare good a day, boss loot tier. */
export function depthRows(): string[] {
  const out = [`  ${pad('depth', 6)}${pad('raid', 12)}${pad('mobs', 7)}${pad('claim s/men/players', 21)}${pad('yield', 7)}${pad('score/day', 11)}${pad('rare/day', 10)}boss loot`];
  DEPTH.forEach((d, i) => {
    const score = i === 0 ? 0 : d.score * DAY_H;
    const rare = i >= 3 ? `≤ ${Math.round(RARE_NODE.regrow * 3600 * DAY_H)}` : '-';
    const tier = i >= 2 ? `tier ${i - 1}` : '-';
    out.push(`  ${pad(i, 6)}${pad(RAID_TO_TAKE[i], 12)}${pad(`x${d.mob}`, 7)}${pad(`${d.claim.ticks / 10}/${d.claim.men}/${d.claim.players}`, 21)}${pad(`x${d.yield}`, 7)}${pad(score, 11)}${pad(rare, 10)}${tier}`);
  });
  out.push(`  frontier town ${SCORE.town * DAY_H}/day, gate ${SCORE.gate * DAY_H}/day, Omphalos ${SCORE.omphalos * DAY_H}/day; host captain hp x${HOST.captain.hp}, guard hp x${HOST.guard.hp}`);
  return out;
}

/** Landmark score: a restored, garrisoned landmark +2/h, capped 6/h an alliance; prestige ≤ 2/h; against Omphalos. */
export const LANDMARK_SCORE = { bonus: 2, cap: 6, prestige: 2 };
export function scoreRows(): string[] {
  const out: string[] = [];
  let worst = 0;
  for (const l of LANDMARKS) {
    const base = l.region === 'omphalos' ? SCORE.omphalos : GATES.includes(l.region) ? SCORE.gate : SCORE.neutral;
    const total = base + LANDMARK_SCORE.bonus;
    if (l.region !== 'omphalos') worst = Math.max(worst, total);
    out.push(`  ${pad(l.name, 28)} region ${base}/h + restored ${LANDMARK_SCORE.bonus}/h = ${total}/h`);
  }
  const all = LANDMARKS.length * LANDMARK_SCORE.bonus;
  out.push(`  one landmark region (Omphalos aside) at most ${worst}/h (≤ 4: ${worst <= 4 ? 'ok' : 'FAIL'}) against Omphalos ${SCORE.omphalos}/h`);
  out.push(`  all nine restored: bonus ${all}/h, capped to ${LANDMARK_SCORE.cap}/h an alliance; temples, shrines, statues ≤ ${LANDMARK_SCORE.prestige}/h`);
  out.push(`  hegemony stays Omphalos + ${HEGEMONY.towns} frontier towns for ${HEGEMONY.ms / 3600_000} h (landmarks do not count)`);
  return out;
}

/** Rare-good flow: node and boss supply against each restore bill (its own good + one from another frontier). */
export function rareRows(): string[] {
  const out: string[] = [];
  const nodeH = (n: number) => n / (RARE_NODE.regrow * 3600);
  const bossOf = (g: RareGood) => WAR_BOSSES.find((b) => b.rare?.good === g);
  const nodeOf = (g: RareGood) => Object.values(RARE_NODES).find((x) => x.res === g);
  out.push(`  node ${fmt(RARE_NODE.regrow * 600)} per 10 min, max ${RARE_NODE.max}: full in ${fmt(nodeH(RARE_NODE.max))} h`);
  let worst = 0;
  for (const l of LANDMARKS) {
    const parts = Object.entries(l.restore.rare) as [RareGood, number][];
    const cells = parts.map(([g, n]) => {
      const kill = bossGoods(bossOf(g)?.id ?? '')[0]?.n ?? 0;
      const once = nodeOf(g)?.once ? RARE_NODE.max : 0; // the slag heap: 20 once
      const left = Math.max(0, n - kill - once);
      const h = nodeH(left);
      worst = Math.max(worst, h);
      return `${g} ${n} (kill ${kill}${once ? `, heap ${once}` : ''}${left ? `, ${fmt(h)} h of node` : ''})`;
    });
    out.push(`  ${pad(l.name, 28)} ${cells.join('; ')}; from another frontier: ${parts.filter(([g]) => g !== l.rare).length}`);
  }
  out.push(`  longest wait on a source: ${fmt(worst)} h of node after the kill; every bill fits a season with one cross-map trade`);
  return out;
}

/** The fights of FIGHTS, one line a raid size. */
export function fightRows(): string[] {
  const out: string[] = [];
  for (const f of FIGHTS) {
    const g = GUARDIANS[f.boss];
    const parts = g.parts ? ` (${g.parts.n} parts x ${g.parts.hp} hp, ${g.parts.dmg} dmg)` : '';
    out.push(`  ${f.boss} (${f.region}): hp ${g.hp}${parts}, dmg ${g.dmg}, armour ${g.armor}${g.guard ? `, guard ${g.guard.n} x ${g.guard.hp} hp` : ''}`);
    for (const n of f.squads) {
      const rs = f.seeds.map((s) => raidFight(f.region, f.boss, mixed(n), s));
      const cell = rs.map((r) => (r.won ? `won ${fmt(r.secs / 60)} min, lost ${r.lost}/${r.men}` : `${r.escaped ? 'fled' : 'failed'} (boss ${Math.round(r.bossHp * 100)}%, lost ${r.lost}/${r.men}, ${fmt(r.secs / 60)} min)`));
      out.push(`    ${pad(`${n} squads`, 10)} ${rs.filter((r) => r.won).length}/${rs.length} won: ${cell.join('; ')}`);
    }
  }
  return out;
}

export function landmarkBalanceReport(): string {
  return [
    'Depth effort vs reward (a day held)',
    ...depthRows(),
    '',
    `Guardian raids (headless on the region JSON; squads of 12, level 6, tier-2 rare kit, mixed in the order ${MIX.slice(0, 6).join(', ')}; ${LIMIT_SECS / 60} min limit)`,
    ...fightRows(),
    '',
    'Landmark score against Omphalos and hegemony',
    ...scoreRows(),
    '',
    'Rare-good flow (restore bills)',
    ...rareRows(),
  ].join('\n');
}
