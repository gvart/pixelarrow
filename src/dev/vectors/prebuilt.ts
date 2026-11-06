/**
 * M7a pre-built towns (src/war/sim/prebuilt.ts createTowns) over a scripted fake works and host: pieces of every
 * pre-built type (and some that are not) in claim zones and outside them, of real teams, neutral and the mobs, standing,
 * damaged, ruined and gone, staffed or not; squads that stand in precincts, leave, die and come back; foes, civilians
 * and the dead by wells; caches emptied. Each step is the world's changes (`d`: ops the Godot side applies to its copy),
 * the tick, the works calls the towns made (foul, vanish) and, every few steps, what the towns answer: towns(),
 * population, prestige, upkeepAt, douse, blessed and saveRoot.
 */
import { Rng } from '../../sim/rng';
import { BUILDINGS, NEUTRAL_TEAM } from '../../war/sim/economy';
import { MOB_TEAM } from '../../war/sim/mobs';
import { BLESS, createTowns, PREBUILT, PRESTIGE_CAP, TOWN_RUIN, WELL, type PreSquad, type PreUnit } from '../../war/sim/prebuilt';
import type { Piece, Works } from '../../war/sim/works';
import type { BuildingType } from '../../war/types';

const TYPES = ['house', 'house', 'house', 'cottage', 'tent', 'temple', 'shrine', 'statue', 'well', 'well', 'cache', 'stall', 'board'] as BuildingType[];
const STATES = ['done', 'done', 'done', 'damaged', 'destroyed', 'foundation'] as const;
const TEAMS = [0, 1, 2, NEUTRAL_TEAM, MOB_TEAM];

interface FakePiece { id: number; type: BuildingType; team: number; x: number; y: number; state: string; staff: boolean;
  pre: { zone: number; gone: boolean; fouled: number; foulT: number }; hold?: { lots: { r: string; n: number; o: string }[]; items: unknown[] } }

function scenario(r: Rng, k: number) {
  const pieces: FakePiece[] = [], calls: unknown[] = [];
  const zones = r.int(1, 4), q = (v: number) => Math.round(v * 4) / 4;
  for (let i = 0, n = r.int(6, 26); i < n; i++) {
    const zone = r.chance(0.2) ? -1 : r.int(0, zones - 1), type = r.pick(TYPES);
    const p: FakePiece = {
      id: i, type, team: r.pick(TEAMS), x: q(20 + zone * 30 + r.range(-8, 8)), y: q(20 + r.range(-8, 8)), state: r.pick(STATES), staff: r.chance(0.6),
      pre: { zone, gone: r.chance(0.05), fouled: r.chance(0.1) ? r.int(0, 400) : 0, foulT: 0 },
    };
    if (type === 'cache' || r.chance(0.1)) p.hold = { lots: [{ r: 'iron', n: r.int(0, 2) * 5, o: '' }], items: [] };
    pieces.push(p);
  }
  // pieces of one zone on one team, as a town is (most of the time)
  for (const p of pieces) if (p.pre.zone >= 0 && r.chance(0.7)) p.team = pieces.find((o) => o.pre.zone === p.pre.zone)!.team;
  // a town at the ruin line: four houses, three down (a temple down, up, or none)
  if (k % 4 === 0) for (const [i, type, state] of [[0, 'house', 'done'], [1, 'house', 'destroyed'], [2, 'house', 'destroyed'], [3, 'house', 'destroyed'], [4, 'temple', k % 8 ? 'done' : 'destroyed']] as const) {
    if (i === 4 && k % 12 === 4) break;
    pieces.push({ id: pieces.length, type, team: k % 3, x: 200 + i, y: 20, state, staff: true, pre: { zone: zones, gone: false, fouled: 0, foulT: 0 } });
  }
  const asPiece = (p: FakePiece) => ({ ...p, def: BUILDINGS[p.type] }) as unknown as Piece;
  let list = pieces.map(asPiece);
  const works = {
    prebuilt: () => list,
    foul(id: number, foulT: number, until?: number) {
      calls.push(['foul', id, foulT, until ?? null]);
      const p = pieces[id].pre;
      p.foulT = foulT;
      if (until !== undefined) p.fouled = until;
      list = pieces.map(asPiece);
    },
    vanish(id: number) {
      calls.push(['vanish', id]);
      if (pieces[id].pre.gone) return;
      pieces[id].pre.gone = true;
      pieces[id].state = 'destroyed'; // works.destroy
      list = pieces.map(asPiece);
    },
  } as unknown as Works;
  const squads: PreSquad[] = Array.from({ length: r.int(2, 7) }, (_, i) => {
    const holy = pieces.filter((p) => PREBUILT[p.type]?.bless), at = holy.length && r.chance(0.5) ? r.pick(holy) : r.pick(pieces);
    return { id: i * 3 + 1, team: r.chance(0.7) ? at.team : r.pick(TEAMS), alive: r.int(0, 4) ? r.int(1, 12) : 0, cx: q(at.x + r.range(-4, 4)), cy: q(at.y + r.range(-4, 4)), civ: r.chance(0.2) };
  });
  const units: (PreUnit & { squad: { team: number } })[] = Array.from({ length: r.int(1, 10) }, () => {
    const wells = pieces.filter((p) => p.type === 'well'), at = wells.length && r.chance(0.5) ? r.pick(wells) : r.pick(pieces);
    return { x: q(at.x + r.range(-2, 2)), y: q(at.y + r.range(-2, 2)), alive: r.chance(0.85), civ: r.chance(0.2) ? 'cook' : null, squad: { team: r.pick(TEAMS) } };
  });
  const host = { squads, units, mob: MOB_TEAM };
  const towns = createTowns(works, host);
  const start = { pieces: pieces.map((p) => JSON.parse(JSON.stringify(p))), squads: squads.map((s) => ({ ...s })), units: units.map((u) => ({ ...u, squad: { ...u.squad } })) };
  const steps: unknown[] = [];
  let t = r.int(0, 3) * 10 + (k % 3 === 2 ? r.int(1, 9) : 0);
  const probes = () => ({
    towns: towns.towns(),
    pop: [-1, 0, 1, 2, 3, NEUTRAL_TEAM, MOB_TEAM].map((tm) => [tm, towns.population(tm), towns.prestige(tm)]),
    upkeep: pieces.filter((_, i) => i % 3 === 0).map((p) => [p.team, p.x + 3, p.y, towns.upkeepAt(p.team, p.x + 3, p.y), towns.upkeepAt(p.team, p.x + 13, p.y)]),
    douse: list.map((b) => towns.douse(b)),
    blessed: squads.map((s) => towns.blessed(s.id)),
    root: (() => { const o = towns.saveRoot(); return { stand: [...o.stand], blessed: [...o.blessed], tick: o.tick }; })(),
  });
  for (let n = 0; n < 160; n++) {
    const d: unknown[] = [];
    // the world moves: squads walk in and out of precincts, die, rise; men by wells; pieces fall, rise, are staffed, emptied
    for (const s of squads) if (r.chance(0.03)) {
      const at = r.pick(pieces);
      s.cx = q(at.x + r.range(-9, 9)); s.cy = q(at.y + r.range(-9, 9));
      if (r.chance(0.2)) s.alive = s.alive ? 0 : r.int(1, 8);
      d.push(['squad', squads.indexOf(s), s.cx, s.cy, s.alive]);
    }
    for (const u of units) if (r.chance(0.03)) {
      const at = r.pick(pieces);
      u.x = q(at.x + r.range(-2, 2)); u.y = q(at.y + r.range(-2, 2)); u.alive = r.chance(0.85);
      d.push(['unit', units.indexOf(u), u.x, u.y, u.alive]);
    }
    if (r.chance(0.06)) {
      const p = r.pick(pieces);
      p.state = r.pick(STATES); p.staff = r.chance(0.6);
      if (p.team !== MOB_TEAM && r.chance(0.2)) p.team = r.pick(TEAMS);
      if (p.hold && r.chance(0.4)) p.hold.lots[0].n = r.chance(0.5) ? 0 : 1e-10;
      d.push(['piece', p.id, p.state, p.staff, p.team, p.hold ? p.hold.lots[0].n : null]);
      list = pieces.map(asPiece);
    }
    if (r.chance(0.01)) {
      const lt = t - r.int(0, 50);
      towns.loadRoot({ tick: lt });
      d.push(['load', lt]);
    }
    t += t % 10 ? 10 - (t % 10) : r.chance(0.1) ? r.int(1, 9) : r.chance(0.02) ? 4000 : 10; // off the scan's beat now and then
    towns.tick(t);
    const rec: Record<string, unknown> = { t, c: calls.splice(0) };
    if (d.length) rec.d = d;
    if (n % 8 === 7 || n === 0) rec.p = probes();
    steps.push(rec);
  }
  return { start, mob: MOB_TEAM, steps };
}

export const vectors = () => {
  const r = new Rng(747);
  return {
    consts: { PREBUILT, BLESS, WELL, PRESTIGE_CAP, TOWN_RUIN },
    scenarios: Array.from({ length: 36 }, (_, k) => scenario(r, k)),
  };
};
