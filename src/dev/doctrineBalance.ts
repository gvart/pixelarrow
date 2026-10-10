/**
 * Doctrine balance (headless): the rows of design/gdd/ai-doctrines.md
 * "Balance targets" that AI-01 owns: the reference army vs each doctrine,
 * battle length, first contact of small armies, and the ridge with a
 * hillFlank attacker. AI-02 adds the captain rows: a band with and without
 * its captain, the kill-captain script, and the bounty against battle gold.
 * The counter-script rows (ai-doctrines.md "Counter script vs doctrine")
 * have no story yet.
 */
import type { BalanceRow } from './balance';
import { hillGrid } from './balance';
import { generateEnemyArmy } from '../game/enemy';
import { partyArmy, type PartyState } from '../world/world';
import { captainBounty } from '../game/campaign';
import { resolveBattle } from '../game/loot';
import { isCaptain, type CaptainMark } from '../sim/stats';
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

/** The band of the captain rows: tier-2 mercenaries (a captained band), `culture` picks the doctrine. */
export function captainBand(seed: number, culture: 'greek' | 'phoenician' | 'celtic' = 'greek', captainDead = false): PartyState {
  return {
    id: 1, kind: 'mercs', name: 'Mercenaries', culture, x: 0, y: 0, size: CAPTAIN_BAND.size, power: 0, level: CAPTAIN_BAND.level, tier: 2,
    seed: (seed * 2654435761) >>> 0 || 1, home: 0, mode: 'wander', tx: 0, ty: 0, idle: 0, captainDead,
  };
}

/** Band and player of the captain rows, set so the reference wins about half the time. */
export const CAPTAIN_BAND = { size: 10, level: 3, playerLevel: 3 };

/** The reference army's men who go for the captain: the swordsman (a thureophoros) and the peltasts. */
const STRIKE_TEAM = ['thureophoros', 'peltast'];

/** How the player's side treats the captain: plain bot, a strike team on him, or the same team on another man. */
export type CaptainScript = 'ignore' | 'kill' | 'decoy';

export interface CaptainFight extends DoctrineFight {
  /** The player's side won. */
  won: boolean;
  /** The captain fell (dead or knocked out); false without one. */
  captainDown: boolean;
  /** Gold the win paid (resolveBattle) and the bounty on top; 0 on a loss. */
  gold: number;
  bounty: number;
}

/**
 * The reference army (starting army at CAPTAIN_BAND.playerLevel, steady bot)
 * against a captained band, with or without its captain (`captainDead`).
 * `script` 'kill': the swordsman and the two peltasts leave the line as
 * individuals at the start and are sent at the captain every half second
 * (ai-doctrines.md fantasy: "send the peltasts round to kill their chief");
 * 'decoy' sends the same men at the man of his group nearest to him instead.
 */
export function runCaptain(seed: number, withCaptain: boolean | 'plain', script: CaptainScript = 'ignore', culture: 'greek' | 'phoenician' | 'celtic' = 'greek'): CaptainFight {
  const ids = { nextId: 1 };
  const mine = standardArmy(new Rng(seed), ids);
  for (const h of mine) setBotLevel(h, CAPTAIN_BAND.playerLevel);
  const band = partyArmy(captainBand(seed, culture, !withCaptain), ids);
  if (withCaptain === 'plain') {
    // the same man in his place, without the captain's mark, level and gear
    const c = band.heroes[0] as Hero & CaptainMark;
    delete c.captain;
    setBotLevel(c, CAPTAIN_BAND.level);
    for (const it of Object.values(c.equip)) if (it) it.rarity = 'common';
  }
  const b = new Battle({ seed, armies: [armySpec(mine, true), { ...armySpec(band.heroes, true), doctrine: band.doctrine }] });
  const capId = band.heroes.findIndex((h) => isCaptain(h));
  const cap = capId >= 0 ? b.units.find((u) => u.side === 1 && u.heroId === band.heroes[capId].id) : undefined;
  b.startBattle();
  // the strike team leaves the line at first contact, when the captain stands in the enemy's front
  const team = script === 'ignore' ? [] : b.units.filter((u) => u.side === 0 && STRIKE_TEAM.includes(u.stats.cls ?? ''));
  let contact = -1;
  for (let i = 0; i < b.timeLimitTicks + 10 && b.phase !== 'ended'; i++) {
    if (cap && team.length && contact >= 0 && b.tick % 10 === 0) {
      let target = cap.state === 'ready' ? cap : undefined;
      if (target && script === 'decoy') {
        let best = Infinity;
        target = undefined;
        for (const e of b.units) {
          if (e.side !== 1 || e === cap || e.state !== 'ready' || e.group !== cap.group) continue;
          const d = (e.x - cap.x) ** 2 + (e.y - cap.y) ** 2;
          if (d < best) [best, target] = [d, e];
        }
      }
      for (const u of team) {
        if (u.state !== 'ready' || !target) continue;
        if (!b.groups[u.group].individual) b.issue(0, { kind: 'detach', unit: u.id });
        const dx = target.x - u.x;
        const dy = target.y - u.y;
        const d = Math.hypot(dx, dy) || 1;
        b.issue(0, { kind: 'form', group: u.group, cx: target.x, cy: target.y, fx: dx / d, fy: dy / d, frontage: 1 });
        b.issue(0, { kind: 'order', group: u.group, order: 'charge' });
      }
    }
    b.step();
    for (const e of b.drainEvents()) if (e.type === 'contact' && contact < 0) contact = e.tick / TICK_RATE;
  }
  const res = b.result();
  const won = res.winner === 0;
  const cu = cap ? res.units.find((u) => u.side === 1 && u.heroId === cap.heroId) : undefined;
  const captainDown = cu?.state === 'dead';
  const gold = won ? resolveBattle(res, mine, band.heroes, new Rng(seed)).outcome.gold : 0;
  const bounty = won && captainDown && capId >= 0 ? captainBounty(band.heroes[capId].level) : 0;
  return { winner: res.winner, seconds: b.tick / TICK_RATE, contact, retreated: res.retreated === 1, won, captainDown, gold, bounty };
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
  rows.push(...captainRows(n));
  return rows;
}

const pts = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)} pts`;

/**
 * The captain rows (ai-doctrines.md "Balance targets", F3; campaign-arc.md
 * gold target): what a captain adds to his band, what killing him is worth,
 * and what his bounty adds to a win's gold. `n` seeds per row.
 */
export function captainRows(n: number): BalanceRow[] {
  const run = (w: boolean | 'plain', s: CaptainScript = 'ignore') => Array.from({ length: n }, (_, i) => runCaptain(3000 + i, w, s));
  const winRate = (r: CaptainFight[]) => r.filter((x) => x.won).length / Math.max(1, r.length);
  const plain = run('plain');
  const ignore = run(true);
  const kill = run(true, 'kill');
  const decoy = run(true, 'decoy');
  const down = (r: CaptainFight[]) => pct(r.filter((x) => x.captainDown).length, r.length);
  const rows: BalanceRow[] = [];
  rows.push({ label: `Captain present vs absent (band wins ${pct(Math.round((1 - winRate(ignore)) * n), n)} vs ${pct(Math.round((1 - winRate(plain)) * n), n)})`, measured: pts(winRate(plain) - winRate(ignore)), target: '+5..+10 pts' });
  rows.push({ label: `Kill-captain vs ignore-captain script (captain falls ${down(kill)} vs ${down(ignore)})`, measured: pts(winRate(kill) - winRate(ignore)), target: '>= +6 pts' });
  rows.push({ label: '  kill-captain vs the same team on another man', measured: pts(winRate(kill) - winRate(decoy)), target: '(info)' });
  // the bounty against the gold of the same wins (resolveBattle: kill gold + the 60 g win bonus)
  const wins = [...ignore, ...kill].filter((x) => x.won);
  const paid = wins.filter((x) => x.bounty > 0);
  const share = (r: CaptainFight[]) => r.reduce((a, x) => a + x.bounty, 0) / Math.max(1, r.reduce((a, x) => a + x.gold, 0));
  rows.push({ label: `Bounty when paid, share of that win's gold (${paid.length} of ${wins.length} wins)`, measured: `${Math.round(share(paid) * 100)}%`, target: '30-60% (F3)' });
  rows.push({ label: '  bounty over every win against a captained band', measured: `+${Math.round(share(wins) * 100)}%`, target: '+10..+20% (arc)' });
  return rows;
}
