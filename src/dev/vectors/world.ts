/**
 * The world layer (server/src/war/world/world.ts and worldDO.ts round several region rooms) for the Godot port
 * (docs/impl/godot-port.md P11): seeded runs of the TS LocalWorld (../localWorld.ts) that godot/tests/sim/test_world.gd
 * replays on the C++ LocalWorld, compared bit for bit at each step: the world's state (regions, transits, hauls, the
 * season, its events and score, the last board), every room's sim digest (exact, unrounded), summary, players present
 * and alliance AIs, the messages out (rooms' JSON as values, binary frames by the sha of their base64), the transfer
 * orders' answers and the world map.
 *
 *  - transfer: a player of Elaia's men joined in Westbank Vineyards cross to Achelous Ford (refusals first: not
 *    adjacent, nobody there, on the road), then haul back home by the Vineyards; offline at the stop, the haul waits
 *    (held), and goes on once he is back.
 *  - season: alliance AIs in two neighbouring regions (Achelous Ford, a frontier town, and the Gorge of the Falls, a
 *    gate) with their wild and warlords, on a fast clock: claims, reports, the season's score, its world events, run to
 *    its end, then the rollover and the next season's first ticks.
 */
import { makePerson } from '../../war/sim/roster';
import { NET_VERSION } from '../../war/net/protocol';
import { TsWorld, type WorldOpts, type WorldRoom, type WorldOut } from '../localWorld';
import { exact } from './sim';
import { FAVOUR_EARN } from '../../war/net/favour';
import { CARGO_TRAVEL, HAUL_RETRY_MS, RETRY_MS } from '../../../server/src/war/world/world';
import { REPORT_TICKS } from '../localWorld';

type Sha = (b: string) => string;

/** A scripted step: `n` world ticks, a transfer order, a player on or off line, a client message to a room, a look at the map. */
type Step =
  | { ticks: number }
  | { transfer: { pid: number; from: string; to: string; path?: string[] } }
  | { online: { pid: number; on: boolean } }
  | { send: { region: string; pid: number; msg: unknown } }
  | { seed: { pid: number; alliance: number; persons: ReturnType<typeof makePerson>[] } }
  | { map: number };

const men = (p: string, cls: string, n: number) => Array.from({ length: n }, (_, i) => makePerson(`${p}${i + 1}`, cls, { level: 1 }));
const join = (region: string, pid: number, team: number, ids: string[][]) => ({ t: 'join', v: NET_VERSION, region, playerId: pid, team, squads: ids });

function transferSteps(): Step[] {
  const h = men('h', 'hoplite', 6), a = men('a', 'archer', 4);
  return [
    { seed: { pid: 1, alliance: 3, persons: [...h, ...a] } },
    { online: { pid: 1, on: true } },
    { send: { region: 'elaia-e', pid: 1, msg: join('elaia-e', 1, 3, [h.map((p) => p.id), a.map((p) => p.id)]) } },
    { ticks: 5 },
    { transfer: { pid: 1, from: 'elaia-e', to: 'kyrene' } }, // not adjacent
    { transfer: { pid: 1, from: 'achelous', to: 'elaia-e' } }, // none of his men there
    { transfer: { pid: 2, from: 'elaia-e', to: 'achelous' } }, // no alliance
    { transfer: { pid: 1, from: 'elaia-e', to: 'achelous' } },
    { transfer: { pid: 1, from: 'elaia-e', to: 'achelous' } }, // on the road
    { map: 1 },
    { ticks: 40 },
    { map: 1 },
    { ticks: 440 }, // arrived: his men hold at the entry
    { map: 1 },
    { send: { region: 'achelous', pid: 1, msg: join('achelous', 1, 3, [h.map((p) => p.id), a.map((p) => p.id)]) } }, // he takes them over
    { ticks: 20 },
    // the haul home: to the Vineyards, then on to Elaia; he goes offline on the way, so it waits at the stop
    { transfer: { pid: 1, from: 'achelous', to: 'elaia-e', path: ['elaia'] } },
    { online: { pid: 1, on: false } },
    { ticks: 600 },
    { map: 1 },
    { ticks: 20 },
    { online: { pid: 1, on: true } },
    { ticks: 700 },
    { map: 1 },
    { ticks: 30 },
  ];
}

function seasonSteps(): Step[] {
  const out: Step[] = [];
  for (let i = 0; i < 64; i++) out.push({ ticks: 50 }, ...(i % 16 === 15 ? [{ map: 0 } as Step] : []));
  return out;
}

const RUNS: { id: string; rooms: WorldRoom[]; opts: WorldOpts; steps: () => Step[] }[] = [
  {
    id: 'transfer',
    rooms: [{ id: 'elaia', seed: 3, opts: { cap: 400, home: 3 } }, { id: 'elaia-e', seed: 5, opts: { cap: 400 } }, { id: 'achelous', seed: 7, opts: { cap: 400 } }],
    opts: { season: { travelScale: 0.05, offExitMsPerTile: 75, lengthMs: 3600_000 } },
    steps: transferSteps,
  },
  {
    id: 'season',
    rooms: [{ id: 'achelous', seed: 1, opts: { cap: 400, wild: true, warlords: true }, ai: [2, 3], held: [3, -1, -1] }, { id: 'gorge', seed: 2, opts: { cap: 400, wild: true }, ai: [1, 2], held: [1, -1] }],
    opts: { msPerTick: 20_000, season: { lengthMs: 3000 * 20_000 } },
    steps: seasonSteps,
  },
];

async function run(r: (typeof RUNS)[number], sha: Sha) {
  const w = new TsWorld(r.rooms, r.opts);
  const msgs = (out: WorldOut[]) => out.map(([region, pid, m]) => [region, pid, (m as { frame?: string }).frame !== undefined ? { frame: sha((m as { frame: string }).frame) } : m]);
  const look = () => ({
    tick: w.tick,
    world: structuredClone(w.world.st),
    rooms: [...w.rooms].map(([id, h]) => {
      const { events: _, ...dig } = exact(h.local.room.sim.snapshot(), { events: () => [] } as never);
      return { id, digest: dig, summary: h.local.room.summary(), present: h.local.room.present(), ai: h.ais.map((a) => ({ ...a.stats(), men: a.men(), present: a.present() })) };
    }),
  });
  let kept = '';
  /** The store, when it changed since the last step. */
  const store = () => {
    const now = JSON.stringify(w.store.dump());
    if (now === kept) return {};
    kept = now;
    return { store: JSON.parse(now) as unknown };
  };
  const steps: unknown[] = [{ start: look(), out: msgs(w.take()), ...store() }];
  for (const s of r.steps()) {
    if ('ticks' in s) {
      for (let i = 0; i < s.ticks; i++) await w.step();
      steps.push({ ticks: s.ticks, got: look(), out: msgs(w.take()), ...store() });
    } else if ('transfer' in s) {
      const { pid, ...o } = s.transfer;
      const res = await w.transfer(pid, o);
      steps.push({ transfer: s.transfer, res, got: look(), out: msgs(w.take()), ...store() });
    } else if ('online' in s) {
      w.setOnline(s.online.pid, s.online.on);
      steps.push({ online: s.online, got: look(), out: msgs(w.take()), ...store() });
    } else if ('send' in s) {
      w.send(s.send.region, s.send.pid, s.send.msg);
      steps.push({ send: s.send, got: look(), out: msgs(w.take()), ...store() });
    } else if ('seed' in s) {
      for (const p of s.seed.persons) w.store.add(s.seed.pid, p);
      w.store.alliances.set(s.seed.pid, s.seed.alliance);
      steps.push({ seed: s.seed, got: look(), out: [], ...store() });
    } else steps.push({ map: s.map, res: JSON.parse(JSON.stringify(w.snapshot(s.map))) as unknown, out: [] });
  }
  return { id: r.id, rooms: r.rooms, opts: r.opts, steps };
}

/** Async: the World's transfers and arrivals await their ports. Runs one after the other. */
export async function vectors(sha: Sha) {
  const runs = [];
  for (const r of RUNS) runs.push(await run(r, sha));
  return { consts: { FAVOUR_CARRIED: FAVOUR_EARN.carried, CARGO_TRAVEL, RETRY_MS, HAUL_RETRY_MS, REPORT_TICKS }, runs };
}
