/**
 * The scenes in the second chunk (QA-05, docs/v5/qa/PERF.md): screens the app never opens
 * first on a normal start (the online war, duels, shop and market, camp, codex, beast trial and
 * the Kit gallery), with everything only they import (the war map's 0.35 MB JSON among it).
 * main.ts starts loading this chunk with the game; BootScene waits for it before the first
 * screen (scenes/lazy.ts), so every scene key exists by the time anything can start one.
 */
import { OnlineScene } from './online/OnlineScene';
import { OnlineArmyScene } from './online/OnlineArmyScene';
import { ClanScene } from './online/ClanScene';
import { MerchantScene } from './online/MerchantScene';
import { DuelScene } from './duel/DuelScene';
import { KitScene } from './KitScene';
import { ShopScene } from './ShopScene';
import { MarketScene } from './MarketScene';
import { BeastTrialScene } from './BeastTrialScene';
import { CodexScene } from './CodexScene';
import { CampScene } from './CampScene';

export const LAZY_SCENES = [OnlineScene, OnlineArmyScene, ClanScene, KitScene, ShopScene, MarketScene, MerchantScene, BeastTrialScene, DuelScene, CampScene, CodexScene];
