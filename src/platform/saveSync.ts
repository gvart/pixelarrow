/**
 * Pure decision logic for syncing the campaign save with the server
 * (GET/PUT /api/save, optimistic concurrency on `revision`). No I/O here, so it
 * is unit-tested directly; src/platform/online.ts does the talking.
 *
 * Bookkeeping kept next to the local save (`SyncMeta`): the server `revision`
 * this storage last agreed with and the save `seq` it agreed on. A local save
 * whose `seq` is past `meta.seq` has changes the server has not seen.
 */
import { migrateResult, type SaveData } from '../game/save';

export interface SyncMeta {
  /** Server revision last read or written successfully. */
  revision: number;
  /** `seq` of the save at that moment. */
  seq: number;
  /** The player this storage synced with (V6-ACCT-07): metadata of another player counts as none. */
  pid?: number;
}

export const SYNC_META_KEY = 'px_sync';

export function seqOf(s: SaveData | null | undefined): number {
  return s && typeof s.seq === 'number' ? s.seq : 0;
}

/**
 * Orders two saves by how far they have been played: `seq` (save counter,
 * carried across devices), then `savedAt`, then battles fought. >0: a is newer.
 */
export function compareSaves(a: SaveData, b: SaveData): number {
  const ds = seqOf(a) - seqOf(b);
  if (ds !== 0) return ds;
  const dt = (a.savedAt ?? 0) - (b.savedAt ?? 0);
  if (dt !== 0) return dt;
  return (a.fought ?? 0) - (b.fought ?? 0);
}

/** Parses/migrates a server blob; null if it is not a usable save. */
export function remoteSaveData(data: unknown): SaveData | null {
  if (!data || typeof data !== 'object') return null;
  try {
    // migrate() mutates while validating; work on a copy.
    const r = migrateResult(JSON.parse(JSON.stringify(data)));
    return r.ok ? r.data : null;
  } catch {
    return null;
  }
}

/** A server blob written by a newer build (V5-011): this build must not overwrite it. */
export function remoteIsNewer(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  try {
    const r = migrateResult(JSON.parse(JSON.stringify(data)));
    return !r.ok && r.reason === 'newer';
  } catch {
    return false;
  }
}

export type LoadDecision =
  /** Server copy wins: replace the local campaign with it. */
  | { action: 'adopt'; data: SaveData; revision: number }
  /** Local copy wins (or the server has none): upload it on top of `revision`. */
  | { action: 'push'; revision: number }
  /** Already in sync. */
  | { action: 'none'; revision: number }
  /** The server copy is from a newer build: neither adopt nor overwrite it; stop uploading. */
  | { action: 'hold'; revision: number }
  /**
   * The first sync with an account, and both copies have a won battle (accounts-v6.md AU-08, §14 Q2):
   * the player chooses. `prefer` is the copy with more progress (preselected); nothing is written
   * until the choice is made.
   */
  | { action: 'ask'; local: SaveData; cloud: SaveData; revision: number; prefer: 'local' | 'cloud' };

/** A campaign has progress worth keeping once it has won a battle (AU-07, AU-08). */
export const hasProgress = (s: SaveData | null | undefined): boolean => (s?.won ?? 0) > 0;

/** More progress first: battles won, then the save order (compareSaves). >0: a has more. */
export function compareProgress(a: SaveData, b: SaveData): number {
  return (a.won ?? 0) - (b.won ?? 0) || compareSaves(a, b);
}

/** What AU-08 shows of a campaign. */
export function summarize(s: SaveData): { day: number; men: number; gold: number; won: number } {
  return { day: Math.floor((s.world?.time ?? 0) / 24) + 1, men: s.heroes?.length ?? 0, gold: s.gold ?? 0, won: s.won ?? 0 };
}

/**
 * What to do after `GET /api/save` at boot.
 * - server empty -> push the local save (if any);
 * - no local save -> adopt the server's;
 * - server moved past what we last saw: adopt it, unless we also have unsynced
 *   local progress, in which case the more-played copy wins;
 * - server unchanged: push if we have unsynced progress;
 * - server copy from a newer build: hold (never overwrite it);
 * - no metadata (this storage never synced with this player): both copies with
 *   a won battle -> ask; only one with a won battle -> keep that one.
 */
export function decideOnLoad(local: SaveData | null, meta: SyncMeta | null, remote: { revision: number; data: unknown }): LoadDecision {
  const rev = Math.max(0, remote.revision | 0);
  if (remoteIsNewer(remote.data)) return { action: 'hold', revision: rev };
  const rdata = remote.data == null ? null : remoteSaveData(remote.data);
  if (!rdata) return local ? { action: 'push', revision: rev } : { action: 'none', revision: rev };
  if (!local) return { action: 'adopt', data: rdata, revision: rev };
  if (!meta) {
    // the first sync with this account: progress is never replaced by a copy without any
    const l = hasProgress(local);
    const r = hasProgress(rdata);
    if (l && r) return { action: 'ask', local, cloud: rdata, revision: rev, prefer: compareProgress(local, rdata) >= 0 ? 'local' : 'cloud' };
    if (l !== r) return r ? { action: 'adopt', data: rdata, revision: rev } : { action: 'push', revision: rev };
  }
  const known = meta?.revision ?? 0;
  const dirty = !meta || seqOf(local) > meta.seq;
  if (rev > known) {
    if (!dirty) return { action: 'adopt', data: rdata, revision: rev };
    return compareSaves(rdata, local) > 0 ? { action: 'adopt', data: rdata, revision: rev } : { action: 'push', revision: rev };
  }
  if (rev === known) return dirty ? { action: 'push', revision: rev } : { action: 'none', revision: rev };
  // The server went backwards (database reset): our copy is the reference.
  return { action: 'push', revision: rev };
}

/** On a 409 during play: which copy survives. Ties keep the local one; a newer build's copy holds. */
export function resolveConflict(local: SaveData, remoteData: unknown): 'local' | 'remote' | 'hold' {
  if (remoteIsNewer(remoteData)) return 'hold';
  const r = remoteSaveData(remoteData);
  if (!r) return 'local';
  return compareSaves(r, local) > 0 ? 'remote' : 'local';
}

export function parseSyncMeta(text: string | null): SyncMeta | null {
  if (!text) return null;
  try {
    const m = JSON.parse(text) as Partial<SyncMeta>;
    if (typeof m.revision !== 'number' || typeof m.seq !== 'number') return null;
    return typeof m.pid === 'number' ? { revision: m.revision, seq: m.seq, pid: m.pid } : { revision: m.revision, seq: m.seq };
  } catch {
    return null;
  }
}
