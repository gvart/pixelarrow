/** Global game state shared between scenes (no Phaser imports). */
import { Campaign } from './game/campaign';
import { carrySettings, readSave, writeSave, clearSave, type SaveData } from './game/save';
import type { Outcome } from './game/loot';
import type { UnitStat } from './game/report';
import type { EnemyArmy } from './game/enemy';
import type { Hero } from './data/units';
import type { BattleSite } from './world/battlefield';
import { gameKV } from './platform/storage';
import { setHaptics } from './platform/telegram';
import { online } from './platform/cloud';
import { newProgress } from './game/tutorial';
import { setReducedMotion } from './ui/motion';

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
}

class GameState {
  campaign!: Campaign;
  pending: PendingBattle | null = null;
  last: LastBattle | null = null;
  cloud = false;
  /** A campaign was loaded from storage (the menu offers Continue). */
  hasSave = false;
  private saving: Promise<void> = Promise.resolve();
  private dirty = false;

  async load(): Promise<void> {
    const kv = gameKV();
    this.cloud = kv.cloud;
    let data: SaveData | null = await readSave(kv.primary);
    if (!data && kv.mirror) data = await readSave(kv.mirror);
    // Cloud save (server): never wait more than a few seconds for it.
    await online.loadCachedEntitlements();
    const remote = await Promise.race([online.pullOnLoad(data), new Promise<null>((r) => setTimeout(() => r(null), PULL_WAIT_MS))]);
    if (!remote) online.abandonPull();
    if (remote) {
      data = remote;
      await this.writeLocal(remote);
    }
    this.hasSave = !!data;
    this.campaign = data ? new Campaign(data) : Campaign.fresh(randomSeed());
    // A first launch: the guided tutorial is offered (src/scenes/FirstRunScene.ts).
    if (!data) this.campaign.data.settings.tutorial = newProgress();
    setHaptics(this.campaign.data.settings.haptics);
    setReducedMotion(this.campaign.data.settings.reduceMotion);
    if (!data) await this.save();
  }

  private async writeLocal(data: SaveData): Promise<void> {
    const kv = gameKV();
    await writeSave(kv.primary, data);
    if (kv.mirror) await writeSave(kv.mirror, data);
  }

  /** Persist (serialised so writes never interleave): locally first, then the cloud (debounced). */
  save(): Promise<void> {
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
    this.campaign = new Campaign(data);
    this.hasSave = true;
    this.pending = null;
    this.last = null;
    setHaptics(this.campaign.data.settings.haptics);
    setReducedMotion(this.campaign.data.settings.reduceMotion);
    await this.writeLocal(data);
  }

  async reset(): Promise<void> {
    const kv = gameKV();
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

export const state = new GameState();
