/**
 * The live region's economy on the wire (./protocol.ts `nodes`, `influence`): what the local sim's worker posts straight
 * from the sim (src/war/view/worker.ts), the server sends per player as JSON control messages.
 *
 *  - Resource nodes: one per player, every NODES_EVERY ticks, the nodes whose state changed since he was last told,
 *    as packed rows (NodeRow). Fog rule: a node is sent (or updated) only while his team sees it; on a (re)join every
 *    node on ground his team has explored comes once (the map remembers what it saw). A node gone from the sim (a
 *    farm razed) is sent in `gone` if he knew it.
 *  - Influence: his own team's bit of the influence mask only, run-length encoded (runs alternate, the first one is
 *    outside), sent whenever it differs from what he has; `v` is the sim's influence version.
 *  - Stock: his own team's stockpile (whole units) whenever it differs from what he has.
 * The client (./client.ts) keeps the nodes by id and rebuilds the InfluenceMap with bit `team` set.
 */
import { GOODS } from './protocol';
import type { InfluenceMap, NodeSnap, ResourceKind } from '../types';

/** Ticks between node updates (amounts change slowly; the local worker uses the same pace). */
export const NODES_EVERY = 10;

/** A node packed: id, good (index into GOODS), x, y, amount (whole), max, flags (1 guarded, 2 rare), obj (-1 none), building (-1 none). */
export type NodeRow = [number, number, number, number, number, number, number, number, number];

export function packNode(n: NodeSnap): NodeRow {
  return [n.id, GOODS.indexOf(n.res as (typeof GOODS)[number]), n.x, n.y, Math.round(n.amount), n.max, (n.guarded ? 1 : 0) | (n.rare ? 2 : 0), n.obj ?? -1, n.building ?? -1];
}

export function unpackNode(r: NodeRow): NodeSnap {
  const [id, res, x, y, amount, max, f, obj, building] = r;
  return {
    id, res: GOODS[res] as ResourceKind, x, y, amount, max,
    ...(obj >= 0 ? { obj } : {}), ...(building >= 0 ? { building } : {}), ...(f & 1 ? { guarded: true as const } : {}), ...(f & 2 ? { rare: true as const } : {}),
  };
}

/** Bit `team` of the mask as runs: outside, inside, outside, ... (the first run may be 0). */
export function encodeInfluence(mask: Uint8Array, team: number): number[] {
  const bit = 1 << team, runs: number[] = [];
  let cur = 0, n = 0;
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i] & bit ? 1 : 0;
    if (v === cur) n++;
    else runs.push(n), (cur = v), (n = 1);
  }
  runs.push(n);
  return runs;
}

export function decodeInfluence(w: number, h: number, team: number, runs: number[], version: number): InfluenceMap {
  const mask = new Uint8Array(w * h), bit = 1 << team;
  let i = 0;
  for (let k = 0; k < runs.length; k++) {
    if (k & 1) mask.fill(bit, i, Math.min(mask.length, i + runs[k]));
    i += runs[k];
  }
  return { w, h, mask, version };
}

/** What the feed needs of the sim, for one team. */
export interface EconomySource {
  nodes: NodeSnap[];
  sees(x: number, y: number): boolean;
  explored(x: number, y: number): boolean;
}

/** One player's economy feed: what he was told, so only changes go out. */
export class EconomyFeed {
  private sent = new Map<number, string>();
  private infl = '';
  private last: number[] | null = null;
  private goods = '';
  private synced = false;

  /** Not synced yet: the first node update goes out at once. */
  get fresh(): boolean {
    return !this.synced;
  }

  /** Node rows to send now (null: nothing changed) and ids gone. */
  nodes(src: EconomySource): { rows: NodeRow[]; gone: number[] } | null {
    const rows: NodeRow[] = [], here = new Set<number>();
    for (const n of src.nodes) {
      here.add(n.id);
      if (!(src.sees(n.x, n.y) || (!this.synced && src.explored(n.x, n.y)))) continue;
      const row = packNode(n), key = row.join();
      if (this.sent.get(n.id) === key) continue;
      this.sent.set(n.id, key);
      rows.push(row);
    }
    this.synced = true;
    const gone: number[] = [];
    for (const id of this.sent.keys()) if (!here.has(id)) gone.push(id);
    for (const id of gone) this.sent.delete(id);
    return rows.length || gone.length ? { rows, gone } : null;
  }

  /** The team's stockpile in whole units when it differs from what he has (null: unchanged). */
  stock(goods: Partial<Record<string, number>> | undefined): Record<string, number> | null {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(goods ?? {})) if (v && Math.floor(v) > 0) out[k] = Math.floor(v);
    const key = JSON.stringify(out);
    if (key === this.goods) return null;
    this.goods = key;
    return out;
  }

  /** The team's influence runs when they differ from what he has (null: unchanged). */
  influence(runs: number[]): number[] | null {
    if (runs === this.last) return null;
    this.last = runs;
    const key = runs.join();
    if (key === this.infl) return null;
    this.infl = key;
    return runs;
  }
}
