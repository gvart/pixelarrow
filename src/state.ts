/** Global game state shared between scenes (no Phaser imports). */
import { Campaign } from './game/campaign';
import { backupRaw, carrySettings, readSaveResult, writeSave, clearSave, type LoadFailure, type SaveData, type Settings } from './game/save';
import type { Outcome } from './game/loot';
import type { UnitStat } from './game/report';
import type { EnemyArmy } from './game/enemy';
import type { Hero } from './data/units';
import type { BattleSite } from './world/battlefield';
import type { KV } from './platform/core/storage';
import { platform } from './platform';
import { setHaptics } from './platform/haptics';
import { online } from './platform/cloud';
import { newProgress } from './game/tutorial';
import { setReducedMotion } from './ui/motion';
import { resolveAbandoned } from './game/campaignBattle';
import { hasProgress } from './platform/saveSync';

/** Device storage key of the last campaign with progress that a cloud copy replaced (kept, never read by the game). */
const REPLACED_KEY = 'px_save_replaced';

/** Longest the boot screen waits for the cloud save before starting with the local one. */
const PULL_WAIT_MS = 6000;

export interface PendingBattle {
  enemy: EnemyArmy;
  seed: number;
  /** World band being fought (absent for a skirmish). */
  partyId?: number;
  /** Who the enemy is ("Bandits", "Galatae raiders"...). */
  label?: string;
  /** Where on the map the battle happens (sets the battlefield terrain). */
  site?: BattleSite;
}

export interface LastBattle {
  outcome: Outcome;
  enemy: EnemyArmy;
  fallen: Hero[];
  partyId?: number;
  label?: string;
  /** For the battle report: length in ticks, per-unit kills and damage, the heroes as they went in. */
  ticks?: number;
  stats?: UnitStat[];
  before?: Hero[];
  /** Gold for a band captain (part of the outcome's gold) and the lair hoard's pieces (first in the loot), for Results. */
  bounty?: number;
  hoard?: number;
}

class GameState {
  campaign!: Campaign;
  pending: PendingBattle | null = null;
  last: LastBattle | null = null;
  cloud = false;
  /** A campaign was loaded from storage (the menu offers Continue). */
  hasSave = false;
  /** The stored save is from a newer build: nothing is written this session (V5-011). */
  readOnly = false;
  /** A one-time message for the player about the save (an i18n key), shown and cleared by the next screen. */
  notice: 'save.corrupt' | 'save.newer' | 'battle.abandoned' | null = null;
  private saving: Promise<void> = Promise.resolve();
  private dirty = false;

  async load(): Promise<void> {
    const kv = saveStores();
    this.cloud = platform.storage.roams;
    this.readOnly = false;
    const prim = await readSaveResult(kv.primary);
    const mirr = prim.kind !== 'ok' && kv.mirror ? await readSaveResult(kv.mirror) : null;
    let data: SaveData | null = prim.kind === 'ok' ? prim.data : mirr?.kind === 'ok' ? mirr.data : null;
    // A save that cannot be loaded is kept, raw, before anything else is written (V5-011).
    let failure: LoadFailure | null = null;
    for (const [r, store] of [[prim, kv.primary], [mirr, kv.mirror]] as const) {
      if (r?.kind !== 'bad' || !store) continue;
      if (r.raw) await backupRaw(store, r.raw, r.reason);
      if (failure !== 'newer') failure = r.reason;
    }
    await online.loadCachedEntitlements();
    if (failure === 'newer') {
      // Written by a newer build: this one must not save over it, here or in the
      // cloud. Play goes on in a campaign that is never saved; updating the app loads it.
      this.readOnly = true;
      this.notice = 'save.newer';
      online.abandonPull();
      this.hasSave = false;
      this.campaign = Campaign.fresh(randomSeed());
      setHaptics(this.campaign.data.settings.haptics);
      setReducedMotion(this.campaign.data.settings.reduceMotion);
      return;
    }
    // Cloud save (server): never wait more than a few seconds for it.
    const remote = await Promise.race([online.pullOnLoad(data), new Promise<null>((r) => setTimeout(() => r(null), PULL_WAIT_MS))]);
    if (!remote) online.abandonPull();
    if (remote) {
      data = remote;
      await this.writeLocal(remote);
    }
    // Unreadable and nothing to restore it from: a new campaign, and the player is told (the raw save is kept).
    if (!data && failure) this.notice = 'save.corrupt';
    this.hasSave = !!data;
    this.campaign = data ? new Campaign(data) : Campaign.fresh(randomSeed());
    // A first launch: the guided tutorial is offered (src/scenes/FirstRunScene.ts).
    if (!data && !failure) this.campaign.data.settings.tutorial = newProgress();
    setHaptics(this.campaign.data.settings.haptics);
    setReducedMotion(this.campaign.data.settings.reduceMotion);
    // The app was closed during a campaign battle: it is fought out now, and stands (V5-011).
    this.last = resolveAbandoned(this.campaign);
    if (this.last) this.notice = 'battle.abandoned';
    if (!data || this.last) await this.save();
  }

  private async writeLocal(data: SaveData): Promise<void> {
    // the platform's save store writes its own mirror (Telegram: CloudStorage and localStorage)
    await writeSave(platform.storage.save(), data);
  }

  /** Persist (serialised so writes never interleave): locally first, then the cloud (debounced). */
  save(): Promise<void> {
    if (this.readOnly) return this.saving;
    this.dirty = true;
    this.saving = this.saving.then(async () => {
      if (!this.dirty) return;
      this.dirty = false;
      const data = this.campaign.sync();
      data.seq = (data.seq ?? 0) + 1;
      data.savedAt = Date.now();
      await this.writeLocal(data);
      online.queuePush(data);
    });
    return this.saving;
  }

  /** A newer copy of the campaign arrived from the server (another device). */
  async adoptRemote(data: SaveData): Promise<void> {
    await this.saving;
    await this.keepReplaced();
    this.campaign = new Campaign(data);
    this.hasSave = true;
    this.pending = null;
    this.last = null;
    setHaptics(this.campaign.data.settings.haptics);
    setReducedMotion(this.campaign.data.settings.reduceMotion);
    await this.writeLocal(data);
  }

  /**
   * Before a cloud copy replaces this device's campaign: one copy of the campaign it replaces, when that
   * had progress, in device storage (the save-systems "keep the last good save" rule; recovered by hand).
   */
  private async keepReplaced(): Promise<void> {
    const cur = this.hasSave ? this.campaign?.data : null;
    if (!cur || !hasProgress(cur)) return;
    try {
      await platform.storage.device().set(REPLACED_KEY, JSON.stringify({ at: Date.now(), data: cur }));
    } catch {
      /* a safety copy only */
    }
  }

  /**
   * After a log-in on this device (V6-ACCT-07): the first sync with the account. A guest campaign goes
   * up to an account that has none; a device without one takes the account's (through online.onAdopt,
   * which also sends the game to the menu); with progress on both sides, online.choice waits for AU-08.
   * True when the account's campaign replaced this device's.
   */
  async syncAfterSignIn(): Promise<boolean> {
    if (this.readOnly) return false;
    await this.saving;
    const remote = await online.pullOnLoad(this.hasSave ? this.campaign.sync() : null);
    if (!remote) return false;
    await online.onAdopt(remote);
    return true;
  }

  /** AU-08 answered: the account's campaign replaces this one, or this one is uploaded over the account's. */
  async keepCampaign(keep: 'local' | 'cloud'): Promise<void> {
    await this.saving;
    const cloud = await online.resolveChoice(keep, this.campaign.sync());
    if (cloud) await online.onAdopt(cloud);
  }

  /**
   * The account was deleted (V6-LINK-07; accounts-v6.md §10.1, UXA-11): this device forgets its campaign,
   * the copy kept from a replaced one and every first-time hint; the language, sound, haptics and
   * accessibility choices stay; the next launch is a first run. Written here only (never uploaded).
   */
  async forgetCampaign(): Promise<void> {
    if (this.readOnly) return;
    await this.saving;
    const prev = this.campaign?.data.settings;
    const kv = saveStores();
    await clearSave(kv.primary);
    if (kv.mirror) await clearSave(kv.mirror);
    try {
      await platform.storage.device().remove(REPLACED_KEY);
    } catch {
      /* a safety copy only */
    }
    this.campaign = Campaign.fresh(randomSeed());
    const s = this.campaign.data.settings;
    if (prev) for (const k of KEPT_ON_DELETE) (s as unknown as Record<string, unknown>)[k] = prev[k];
    s.tutorial = newProgress();
    this.pending = null;
    this.last = null;
    this.hasSave = false;
    await this.writeLocal(this.campaign.sync());
  }

  async reset(): Promise<void> {
    if (this.readOnly) return;
    const kv = saveStores();
    const seq = this.campaign?.data.seq ?? 0;
    const prev = this.campaign?.data.settings;
    await clearSave(kv.primary);
    if (kv.mirror) await clearSave(kv.mirror);
    this.campaign = Campaign.fresh(randomSeed());
    // Settings belong to the player, not to the campaign: all of them carry over.
    this.campaign.data.settings = carrySettings(prev, this.campaign.data.settings);
    // Keep counting so the new campaign outranks the old one in cloud sync.
    this.campaign.data.seq = seq;
    this.pending = null;
    this.last = null;
    this.hasSave = true;
    await this.save();
  }
}

/**
 * Where the save is read from: the platform's save store and, when this device
 * keeps a separate copy (Telegram's localStorage mirror of CloudStorage), that
 * copy, which a load falls back to as a whole when the primary cannot be read.
 */
function saveStores(): { primary: KV; mirror: KV | null } {
  const primary = platform.storage.save();
  const device = platform.storage.device();
  return { primary, mirror: device === primary ? null : device };
}

/** Seeds for new campaigns/battles come from the clock + crypto (outside the sim). */
export function randomSeed(): number {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] >>> 0 || 1;
  } catch {
    return (Date.now() ^ 0x5f3759df) >>> 0;
  }
}

/** The player's own preferences a deleted account leaves on the device (accounts-v6.md §10.3: language and sound), and the analytics choice (an opt-out never turns back on by itself). */
const KEPT_ON_DELETE = ['lang', 'sound', 'musicVol', 'sfxVol', 'haptics', 'reduceMotion', 'reduceShake', 'reduceFlash', 'leftHand', 'keyHints', 'analytics'] as const satisfies readonly (keyof Settings)[];

export const state = new GameState();
