/**
 * Playing a scenario (./types.ts) onto a sim: the sandbox does it through its worker client (../view/devPanel.ts), the
 * tests straight onto createSim (headlessHost). Both run the same steps in the same order, so a seed plays the same.
 */
import type { Behaviour, Bots } from '../sim/bots';
import type { Order, ResourceKind, WarBuildSim, WarSim } from '../types';
import type { Scenario, ScenarioGo, ScenarioSquad } from './types';

/** What applying a scenario needs of a sim (the sandbox's SimClient has these). */
export interface ScenarioHost {
  spawn(owner: string, team: number, cls: string, count: number, x: number, y: number, bot?: Behaviour, go?: ScenarioGo): void;
  claim(team: number, x: number, y: number, r?: number): void;
  addStock(team: number, res: ResourceKind, n: number): void;
  order(o: Order): void;
  prebuild(team: number, max: number): void;
  skip(ticks: number): void;
  finishBridges(team: number): void;
  spawnCart(team: number, owner: string, type: 'handcart' | 'wagon', x: number, y: number): void;
  spawnMobs(): void;
  hurtBossTo(boss: string, to: number): void;
}

/** The player's team in a scenario (?team= on the page wins; ../view/main.ts sets it). */
export const playerTeam = (sc: Scenario): number => sc.team ?? 0;

/**
 * Place a scenario's squads (with their bot behaviours), lay out and prebuild its sites, carts and the after-steps.
 * `around`: wraps each after-squad's spawn (the sandbox gives civilians their roster levels there).
 */
export function applyScenario(h: ScenarioHost, sc: Scenario, around?: (q: ScenarioSquad, spawn: () => void) => void): void {
  const e = sc.economy, me = playerTeam(sc);
  if (sc.neutral) h.spawnMobs();
  for (const c of e?.claims ?? []) h.claim(c.team, c.x, c.y, c.r);
  for (const [r, n] of Object.entries(e?.stock ?? {})) h.addStock(me, r as ResourceKind, n);
  for (const [r, n] of Object.entries(e?.foeStock ?? {})) h.addStock(1, r as ResourceKind, n);
  for (const q of sc.squads) h.spawn(q.owner ?? (q.team === me ? 'you' : 'bot'), q.team, q.cls, q.count, q.x, q.y, q.bot, q.go);
  // each team that lays out walls or sites builds its own before play
  const teams = [...new Set([...(e?.walls ?? []), ...(e?.sites ?? [])].map((q) => sc.squads[q.squad]?.team ?? 0))];
  // squad ids follow the spawn order; walls before the sites (stairs and ladders lean on them)
  const phases = [...new Set([...(e?.walls ?? []), ...(e?.sites ?? [])].map((q) => q.phase ?? 0))].sort((a, b) => a - b);
  for (const p of phases) {
    for (const { squad, phase, ...w } of e?.walls ?? []) if ((phase ?? 0) === p) h.order({ kind: 'placeWall', squad, ...w });
    for (const t of e?.sites ?? []) if ((t.phase ?? 0) === p) h.order({ kind: 'placeBuilding', squad: t.squad, type: t.type, x: t.x, y: t.y, rot: t.rot });
    if (e?.prebuild) for (const t of teams) h.prebuild(t, e.prebuild);
  }
  if (e?.bridges?.length) {
    for (const { team, ...b } of e.bridges) h.order({ kind: 'placeBridge', team, ...b });
    h.skip(1); // orders apply on the next step
    for (const t of new Set(e.bridges.map((b) => b.team))) h.finishBridges(t);
  }
  for (const c of sc.carts ?? []) h.spawnCart(c.team, c.owner, c.type, c.x, c.y);
  for (const o of sc.after?.orders ?? []) h.order(o);
  if (sc.after?.settle) h.skip(sc.after.settle);
  for (const q of sc.after?.squads ?? []) {
    const spawn = () => h.spawn(q.team === me ? 'you' : q.bot ? 'bot' : 'raiders', q.team, q.cls, q.count, q.x, q.y, q.bot, q.go);
    if (around) around(q, spawn);
    else spawn();
  }
  for (const o of sc.after?.then ?? []) h.order(o);
  for (const b of sc.bosses ?? []) h.hurtBossTo(b.boss, b.to); // M7d
  if (sc.after?.later) h.skip(sc.after.later.settle);
  for (const o of sc.after?.later?.orders ?? []) h.order(o);
}

/** Step the sim and its bots one tick. */
export function stepSim(sim: WarSim, bots: Bots): void {
  sim.step();
  bots.tick();
}

/**
 * Step the sim (and bots) up to `max` ticks at once: every 20 ticks each idle squad of `team` (see below) is sent to the
 * unfinished site of the team nearest it; stops when none is left.
 */
export function prebuildSim(s: WarSim, bots: Bots, team: number, max: number): void {
  for (let t = 0; t < max; t++) {
    stepSim(s, bots);
    if (t % 20) continue;
    const snap = s.snapshot(), open = (snap.buildings ?? []).filter((b) => b.team === team && (b.state === 'foundation' || b.state === 'scaffold'));
    if (!open.length) break;
    const units = new Map(snap.units.map((u) => [u.id, u]));
    for (const q of snap.squads) {
      const us = q.units.map((id) => units.get(id)!).filter((v) => v && v.state !== 'dead'), u = us[0];
      // idle builders: not on a build order, or on one with nobody labouring, hauling or walking to it
      // (every 400 ticks all of them again: a squad can get stuck on a site it cannot reach)
      if (q.team !== team || !u || (t % 400 && q.order === 'build' && us.some((v) => v.state === 'build' || v.carry || v.state === 'move'))) continue;
      if (q.order === 'build') s.order({ kind: 'stopWork', squad: q.id });
      const site = open.reduce((a, b) => (Math.hypot(b.x - u.x, b.y - u.y) < Math.hypot(a.x - u.x, a.y - u.y) ? b : a));
      s.order({ kind: 'build', squad: q.id, site: site.id });
    }
  }
}

/** A spawn's own first order (ScenarioSquad.go) once it stands. */
export function goOrder(squad: number, go: ScenarioGo): Order {
  return go.kind === 'move' ? { kind: 'move', squad, x: go.x, y: go.y } : { kind: 'attackMove', squad, x: go.x, y: go.y };
}

/** Guardian `boss` down to `to` of its max hp (no change when it is already lower). */
export function hurtBossTo(sim: WarBuildSim, boss: string, to: number): void {
  const g = sim.snapshot().bosses?.find((x) => x.id === boss);
  if (g && g.hp > g.maxHp * to) sim.hurtBoss(boss, g.hp - g.maxHp * to, 'you');
}

/**
 * A host straight onto a sim (tests, tools). `cap`: at most this many ticks per prebuild or skip, so a whole catalogue
 * loads fast (the bases stand half built; every step still runs).
 */
export function headlessHost(sim: WarBuildSim, bots: Bots, cap = Infinity): ScenarioHost {
  return {
    spawn: (owner, team, cls, count, x, y, bot, go) => {
      const id = sim.spawnSquad(owner, team, cls, count, x, y);
      if (id < 0) return;
      if (bot) bots.set(id, bot);
      if (go) sim.order(goOrder(id, go));
    },
    claim: (team, x, y, r) => sim.claim(team, x, y, r),
    addStock: (team, res, n) => sim.addStock(team, res, n),
    order: (o) => sim.order(o),
    prebuild: (team, max) => prebuildSim(sim, bots, team, Math.min(max, cap)),
    skip: (ticks) => { for (let i = 0; i < Math.min(ticks, cap); i++) stepSim(sim, bots); },
    finishBridges: (team) => sim.finishBridges(team),
    spawnCart: (team, owner, type, x, y) => void sim.spawnCart(team, owner, type, x, y),
    spawnMobs: () => sim.spawnMobs(),
    hurtBossTo: (boss, to) => hurtBossTo(sim, boss, to),
  };
}
