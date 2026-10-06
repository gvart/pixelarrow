/** Global game state shared between scenes (no Phaser imports). */
import { Campaign } from './game/campaign';
import { readSave, writeSave, clearSave, type SaveData } from './game/save';
import type { Outcome } from './game/loot';
import type { EnemyArmy } from './game/enemy';
import type { Hero } from './data/units';
import { gameKV } from './platform/storage';
import { setHaptics } from './platform/telegram';

export interface PendingBattle {
  enemy: EnemyArmy;
  seed: number;
  /** World band being fought (absent for a skirmish). */
  partyId?: number;
  /** Who the enemy is ("Bandits", "Galatae raiders"...). */
  label?: string;
}

export interface LastBattle {
  outcome: Outcome;
  enemy: EnemyArmy;
  fallen: Hero[];
  partyId?: number;
  label?: string;
}

class GameState {
  campaign!: Campaign;
  pending: PendingBattle | null = null;
  last: LastBattle | null = null;
  cloud = false;
  private saving: Promise<void> = Promise.resolve();
  private dirty = false;

  async load(): Promise<void> {
    const kv = gameKV();
    this.cloud = kv.cloud;
    let data: SaveData | null = await readSave(kv.primary);
    if (!data && kv.mirror) data = await readSave(kv.mirror);
    this.campaign = data ? new Campaign(data) : Campaign.fresh(randomSeed());
    setHaptics(this.campaign.data.settings.haptics);
    if (!data) await this.save();
  }

  /** Persist (serialised so writes never interleave). */
  save(): Promise<void> {
    this.dirty = true;
    this.saving = this.saving.then(async () => {
      if (!this.dirty) return;
      this.dirty = false;
      const data = this.campaign.sync();
      const kv = gameKV();
      await writeSave(kv.primary, data);
      if (kv.mirror) await writeSave(kv.mirror, data);
    });
    return this.saving;
  }

  async reset(): Promise<void> {
    const kv = gameKV();
    await clearSave(kv.primary);
    if (kv.mirror) await clearSave(kv.mirror);
    this.campaign = Campaign.fresh(randomSeed());
    this.pending = null;
    this.last = null;
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
