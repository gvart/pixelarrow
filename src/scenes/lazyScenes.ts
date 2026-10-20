/**
 * The scenes in the second chunk (QA-05, docs/v5/qa/PERF.md): screens the app never opens
 * first on a normal start (clans, duels, shop, camp, codex, beast trial and the Kit gallery),
 * with everything only they import.
 * main.ts starts loading this chunk with the game; BootScene waits for it before the first
 * screen (scenes/lazy.ts), so every scene key exists by the time anything can start one.
 */
import { ClanScene } from './online/ClanScene';
import { DuelScene } from './duel/DuelScene';
import { KitScene } from './KitScene';
import { ShopScene } from './ShopScene';
import { BeastTrialScene } from './BeastTrialScene';
import { CodexScene } from './CodexScene';
import { CampScene } from './CampScene';

export const LAZY_SCENES = [ClanScene, KitScene, ShopScene, BeastTrialScene, DuelScene, CampScene, CodexScene];
