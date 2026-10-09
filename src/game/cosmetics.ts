/**
 * The player's equipped cosmetics as the art sees them (slot -> cosmetic id).
 *
 * The loadout itself lives on the server (wallet.loadout, server/src/economy);
 * the shop reports every wallet it loads and every equip here, and the value
 * is remembered on this device so the next battle dresses the army at once,
 * offline too. Visible slots: emblem (shield paint), cloak, crest, army_skin
 * (src/art/paperdoll.ts applyCosmetics), aura (battle particles) and pose
 * (victory pose); banner tints the formation standards.
 */
import { safeLocalStorage } from '../platform/storage';

const KEY = 'pixelarrow.cosmetics';

let cache: Record<string, string> | null = null;

/** The loadout last reported by the shop (empty when none). */
export function cosmeticLoadout(): Record<string, string> {
  if (cache) return cache;
  cache = {};
  try {
    const raw = safeLocalStorage()?.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    if (v && typeof v === 'object') for (const [k, id] of Object.entries(v as Record<string, unknown>)) if (typeof id === 'string' && id.length < 64) cache[k] = id;
  } catch {
    /* a corrupt entry: start empty */
  }
  return cache;
}

/** Remember a loadout (from a loaded wallet or an equip answer). */
export function setCosmeticLoadout(lo: Record<string, string> | null | undefined): void {
  cache = { ...(lo ?? {}) };
  try {
    safeLocalStorage()?.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* private mode: kept for this session only */
  }
}

/** Particle look of an aura cosmetic: colours of the motes. */
export const AURA_COLORS: Record<string, number[]> = {
  aura_embers: [0xffb040, 0xffe080, 0xf07830],
  aura_laurel: [0x9ad87a, 0xe0d070, 0xc8f0a0],
  aura_storm: [0xb0e0ff, 0xffffff, 0x80b0f0],
};

/** Banner cosmetic -> standard cloth ramp (light..dark) and emblem colour. */
export const BANNER_COLORS: Record<string, { cloth: number[]; ink: number }> = {
  banner_crimson: { cloth: [0xd06048, 0xa83224, 0x8a2a1e, 0x6e2219, 0x4e1810], ink: 0xf6ecd8 },
  banner_laurel: { cloth: [0x9ad87a, 0x5f8a45, 0x4e7438, 0x3e5a2c, 0x2c4020], ink: 0xe0b040 },
  supporter_banner: { cloth: [0xfff0a0, 0xe0b040, 0xb8902c, 0x8a6a28, 0x5e4618], ink: 0x8c2f25 },
  banner_pass_s: { cloth: [0xd09aff, 0x9a58c0, 0x7a4498, 0x5e3478, 0x40224e], ink: 0xe0b040 },
  duel_banner_hoplite: { cloth: [0xc0503f, 0x8c2f25, 0x74261e, 0x5e1e17, 0x40140e], ink: 0xe0b040 },
  duel_banner_strategos: { cloth: [0x7a68c0, 0x4a3a8c, 0x3c3074, 0x2e2460, 0x201a44], ink: 0xe0b040 },
  duel_banner_legend: { cloth: [0x5ab0a0, 0x2a7a6a, 0x226456, 0x1a5046, 0x123830], ink: 0xfff0a0 },
};
