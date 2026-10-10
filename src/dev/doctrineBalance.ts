/**
 * Doctrine balance (headless): the rows of design/gdd/ai-doctrines.md
 * "Balance targets" that AI-01 owns: the reference army vs each doctrine,
 * battle length, first contact of small armies, and the ridge with a
 * hillFlank attacker. Counter scripts and captains come with AI-02.
 */
import type { BalanceRow } from './balance';
import { hillGrid } from './balance';
import { generateEnemyArmy } from '../game/enemy';
import { armySpec } from '../game/armySpec';
import { setBotLevel, standardArmy } from '../game/heroes';
import type { Hero } from '../data/units';
import { Battle, TICK_RATE } from '../sim/battle';
import { Rng } from '../sim/rng';
import { generateBattlefield, randomSite } from '../world/battlefield';
import { DOCTRINE_IDS, type ArmySpec, type BattleSetup, type DoctrineId, type Side } from '../sim/types';

export interface DoctrineFight {
  winner: Side | -1;
  seconds: number;
  /** s of the first contact, -1 = never */
  contact: number;
  /** the bot side quit the field */
  retreated: boolean;
}

function fight(setup: BattleSetup): DoctrineFight {
  const b = new Battle(setup);
  b.startBattle();
  let contact = -1;
  for (let i = 0; i < b.timeLimitTicks + 10 && b.phase !== 'ended'; i++) {
    b.step();
    for (const e of b.drainEvents()) if (e.type === 'contact' && contact < 0) contact = e.tick / TICK_RATE;
  }
  return { winner: b.winner ?? -1, seconds: b.tick / TICK_RATE, contact, retreated: b.retreated === 1 };
}

const withDoctrine = (a: ArmySpec, doctrine: DoctrineId): ArmySpec => ({ ...a, doctrine });

/**
 * The reference army (the starting army, steady bot) against the bot army
 * matched to it, fighting under `doctrine`. Same seeds and armies as the
 * "Matched" row, so steady here is that row.
 */
export function runReference(seed: number, doctrine: DoctrineId): DoctrineFight {
  const ids = { nextId: 1 };
  const heroes = standardArmy(new Rng(seed), ids);
  const enemy = generateEnemyArmy(new Rng(seed ^ 0xa5a5a5a5), ids, heroes, 0).heroes;
  return fight({ seed, armies: [armySpec(heroes, true), withDoctrine(armySpec(enemy, true), doctrine)] });
}

/**
 * First contact of a small fight (AC 3): five level-1 men against the
 * five-man army matched to them, both bot-driven on an open field, like the
 * "Matched" row's first contact. `waiting` = the player's five hold their
 * deployment on a campaign battlefield (campaignSetup's random site), the
 * playtest case of docs/v5/audit/PLAY.md P1.
 */
export function runSmallContact(seed: number, waiting = false, doctrine: DoctrineId = 'steady'): DoctrineFight {
  const ids = { nextId: 1 };
  const mine = standardArmy(new Rng(seed), ids).slice(0, 5);
  for (const h of mine) h.level = 1;
  const foe = generateEnemyArmy(new Rng(seed ^ 0xa5a5a5a5), ids, mine, 0).heroes.slice(0, 5);
  const terrain = waiting ? generateBattlefield(seed, randomSite(new Rng(seed ^ 0x51735c1))) : undefined;
  return fight({ seed, armies: [armySpec(mine, !waiting), withDoctrine(armySpec(foe, true), doctrine)], timeLimit: 120, terrain });
}

/** balance.ts mirrorArmy: the starting army at level 4 without perks. */
function mirrorArmy(seed: number): Hero[] {
  const heroes = standardArmy(new Rng(seed), { nextId: 1 });
  for (const h of heroes) {
    setBotLevel(h, 4);
    h.perks = [];
  }
  return heroes;
}

/** The ridge mirror (balance.ts terrain row) with the attacker under `doctrine`; true = the defender won. */
export function runRidge(seed: number, doctrine: DoctrineId): DoctrineFight & { defenderWon: boolean } {
  const a = mirrorArmy(seed);
  const b = JSON.parse(JSON.stringify(a)) as typeof a;
  b.forEach((h, i) => (h.id = `m${i}`));
  const hero: Side = seed % 2 === 1 ? 1 : 0;
  const armies: [ArmySpec, ArmySpec] = [armySpec(a, true), armySpec(b, true)];
  const att: Side = hero === 0 ? 1 : 0;
  armies[att] = withDoctrine(armies[att], doctrine);
  const r = fight({ seed, armies, terrain: hillGrid(hero) });
  return { ...r, defenderWon: r.winner === hero };
}

/** The doctrine the ridge row's attacker fights with (a hillFlank doctrine, R5). */
export const RIDGE_ATTACKER: DoctrineId = 'rush';

const pct = (k: number, n: number) => `${Math.round((100 * k) / Math.max(1, n))}%`;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const LEN_TARGET: Record<DoctrineId, string> = { steady: '60-150 s', rush: '60-90 s', hammer: '80-150 s', swarm: '80-150 s', fury: '60-150 s' };

/** `n` = seeds per row (the GDD asks for 400 at the default run). */
export function doctrineRows(n: number): BalanceRow[] {
  const rows: BalanceRow[] = [];
  for (const d of DOCTRINE_IDS) {
    const r = Array.from({ length: n }, (_, i) => runReference(1000 + i, d));
    const won = r.filter((x) => x.winner === 0).length;
    rows.push({ label: `Reference (steady) vs ${d}: reference wins`, measured: pct(won, n), target: '40-60%' });
    const len = median(r.map((x) => x.seconds));
    const fled = r.filter((x) => x.retreated).length;
    rows.push({ label: `  ${d} median length (bot retreats ${pct(fled, n)})`, measured: `${len.toFixed(0)} s`, target: LEN_TARGET[d] });
  }
  const k = Math.max(40, Math.round(n / 4));
  const contact = (rs: DoctrineFight[]) => `${mean(rs.map((x) => (x.contact < 0 ? 120 : x.contact))).toFixed(1)} s`;
  rows.push({ label: '5v5 level-1, both bot-driven: first contact', measured: contact(Array.from({ length: k }, (_, i) => runSmallContact(1500 + i))), target: '<= 15 s' });
  rows.push({ label: '  campaign field, player waits: first contact', measured: contact(Array.from({ length: k }, (_, i) => runSmallContact(1500 + i, true))), target: '(info; PLAY P1 33 s)' });
  const rk = Math.max(40, Math.round(n * 0.3));
  for (const d of ['rush', 'hammer', 'swarm'] as const) {
    const rg = Array.from({ length: rk }, (_, i) => runRidge(9000 + i, d));
    const won = pct(rg.filter((x) => x.defenderWon).length, rk);
    rows.push({ label: `Ridge defender vs ${d} attacker (hillFlank)`, measured: won, target: d === RIDGE_ATTACKER ? '62-68% (from 74%)' : '(info)' });
  }
  return rows;
}
