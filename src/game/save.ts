/**
 * Versioned save schema, migrations and chunking for key/value backends with
 * small value limits (Telegram CloudStorage allows 4096 chars per key).
 */
import { ITEMS, normalizeRarity, RARITIES, type Item } from '../data/items';
import { classGearBlocker } from '../data/gearRules';
import { classOfHero } from '../data/classes';
import type { LangSetting } from '../i18n';
import type { Hero } from '../data/units';
import { defaultAttrs, PERKS, POINTS_PER_LEVEL } from '../data/perks';
import { World, type WorldSave } from '../world/world';
import type { TutorialProgress } from './tutorial';

export const SAVE_VERSION = 5;

export interface Settings {
  pauseContact: boolean;
  pauseFlank: boolean;
  pauseRout: boolean;
  pauseDeath: boolean;
  haptics: boolean;
  /** Floating damage numbers in battle. */
  dmgNumbers: boolean;
  /** Sound on/off, music and effects volume 0..10 (src/audio). */
  sound: boolean;
  musicVol: number;
  sfxVol: number;
  /** The one-time touch-controls hint was shown (battle deployment). */
  seenGestureHint: boolean;
  /** UI language: 'auto' follows Telegram / the browser (src/i18n). */
  lang: LangSetting;
  /** First-time hints already shown, by screen id (src/ui/widgets.ts firstTimeHint). */
  seenHints?: string[];
  /** The guided tutorial (src/game/tutorial.ts): offered, active, done or skipped. Missing on saves from before it. */
  tutorial?: TutorialProgress;
  /** Online coach marks already shown (count, src/game/tutorial.ts ONLINE_COACH). */
  onlineCoach?: number;
  /** Anonymous product analytics (src/platform/analytics.ts); off = nothing is sent. */
  analytics: boolean;
  /** Reduce motion (src/ui/motion.ts); missing = follow the system's prefers-reduced-motion. */
  reduceMotion?: boolean;
}

/**
 * The settings a new campaign starts with: every player preference carries
 * over (language, sound and volumes, haptics, reduce motion, pause rules, the
 * analytics choice, hints and tutorial progress); none of them belongs to the
 * campaign. Before iteration 2 only the tutorial and the coach marks did, so
 * "New campaign" silently reset the rest (analytics back on included).
 */
export function carrySettings(prev: Partial<Settings> | undefined, fresh: Settings): Settings {
  return { ...fresh, ...(prev ?? {}) };
}

export const DEFAULT_SETTINGS: Settings = {
  pauseContact: true,
  pauseFlank: true,
  pauseRout: true,
  pauseDeath: false,
  haptics: true,
  dmgNumbers: true,
  sound: true,
  musicVol: 6,
  sfxVol: 7,
  seenGestureHint: false,
  lang: 'auto',
  analytics: true,
};

export interface SaveData {
  v: number;
  gold: number;
  heroes: Hero[];
  stash: Item[];
  nextId: number;
  rng: number;
  won: number;
  fought: number;
  settings: Settings;
  /** Overland campaign: map seed, party position, roaming bands, settlement stock, time. */
  world: WorldSave;
  /**
   * Cloud sync bookkeeping (optional, no version bump): `seq` grows by one on
   * every save and is carried over when a save is adopted from the server, so
   * the higher `seq` is the more-played copy; `savedAt` (ms) breaks ties.
   */
  seq?: number;
  savedAt?: number;
  /** Heroes whose gear their class may no longer use was moved to the stash (v5 class limits): shown once, then cleared. */
  gearMoved?: string[];
}

type Migration = (d: Record<string, unknown>) => Record<string, unknown>;

/** migrations[n] upgrades a version-n save to version n+1. */
const migrations: Record<number, Migration> = {
  // v1 had no settings block and stored battle groups only implicitly.
  1: (d) => ({ ...d, v: 2, settings: { ...DEFAULT_SETTINGS }, heroes: ((d.heroes as Hero[]) ?? []).map((h) => ({ ...h, group: h.group ?? 0 })) }),
  // v2 had no attributes, perks, wounds or world map: heroes get neutral attributes and
  // the points they would have earned; the army sets out on a freshly generated map.
  2: (d) => ({
    ...d,
    v: 3,
    heroes: ((d.heroes as Hero[]) ?? []).map((h) => ({
      ...h,
      attrs: defaultAttrs(),
      points: Math.max(0, ((h.level ?? 1) - 1) * POINTS_PER_LEVEL),
      perks: [],
      wound: 0,
    })),
    world: World.fresh(((d.rng as number) ^ 0x7f4a7c15) >>> 0 || 1),
  }),
  // v3 had four rarity tiers: fine -> uncommon, heroic -> epic (same stat multipliers).
  3: (d) => {
    const fix = (it: unknown) => {
      if (it && typeof it === 'object' && 'rarity' in it) (it as { rarity: unknown }).rarity = normalizeRarity((it as { rarity: unknown }).rarity);
    };
    for (const h of (d.heroes as Hero[]) ?? []) for (const it of Object.values(h?.equip ?? {})) fix(it);
    for (const it of (d.stash as unknown[]) ?? []) fix(it);
    return { ...d, v: 4 };
  },
  // v4 let any hero wear anything; v5 limits weapons, shields and armour by class
  // (docs/ITEMS.md "Class limits"): what a hero's class may not use goes to the stash.
  4: (d) => {
    const stash = [...((d.stash as Item[]) ?? [])];
    const moved: string[] = [];
    for (const h of (d.heroes as Hero[]) ?? []) {
      if (!h?.equip) continue;
      const cls = classOfHero({ cls: h.cls, arch: h.arch, culture: h.culture, weaponDef: h.equip.weapon?.def });
      for (const slot of Object.keys(h.equip) as (keyof Hero['equip'])[]) {
        const it = h.equip[slot];
        if (!it || !ITEMS[it.def] || !classGearBlocker(cls, ITEMS[it.def])) continue;
        stash.push(it);
        delete h.equip[slot];
        if (!moved.includes(h.name)) moved.push(h.name);
      }
    }
    return { ...d, v: 5, stash, ...(moved.length ? { gearMoved: moved } : {}) };
  },
};

export function migrate(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  let d = raw as Record<string, unknown>;
  let v = typeof d.v === 'number' ? d.v : 0;
  if (v < 1 || v > SAVE_VERSION) return null;
  while (v < SAVE_VERSION) {
    const m = migrations[v];
    if (!m) return null;
    d = m(d);
    v = d.v as number;
  }
  return validate(d) ? (d as unknown as SaveData) : null;
}

function validItem(i: unknown): i is Item {
  if (!i || typeof i !== 'object') return false;
  const it = i as Item;
  // Legacy tier names (synced from an older client or server) are mapped, not rejected.
  if (typeof it.rarity === 'string' && !RARITIES.includes(it.rarity)) it.rarity = normalizeRarity(it.rarity);
  return typeof it.uid === 'string' && typeof it.def === 'string' && !!ITEMS[it.def] && RARITIES.includes(it.rarity) && typeof it.cond === 'number';
}

function validate(d: Record<string, unknown>): boolean {
  if (typeof d.gold !== 'number' || !Array.isArray(d.heroes) || !Array.isArray(d.stash)) return false;
  if (typeof d.nextId !== 'number' || typeof d.rng !== 'number') return false;
  for (const h of d.heroes as Hero[]) {
    if (!h || typeof h.id !== 'string' || typeof h.level !== 'number' || !h.equip || !h.look) return false;
    for (const it of Object.values(h.equip)) if (it && !validItem(it)) return false;
    // Tolerate partial progression data rather than losing the save.
    if (!h.attrs || typeof h.attrs.str !== 'number') h.attrs = defaultAttrs();
    if (typeof h.points !== 'number') h.points = 0;
    h.perks = Array.isArray(h.perks) ? h.perks.filter((p) => p in PERKS) : [];
    if (typeof h.wound !== 'number') h.wound = 0;
  }
  const w = d.world as WorldSave | undefined;
  if (!w || typeof w.seed !== 'number' || typeof w.time !== 'number' || !Array.isArray(w.parties) || !Array.isArray(w.places)) {
    d.world = World.fresh(((d.rng as number) ^ 0x7f4a7c15) >>> 0 || 1);
  }
  for (const it of d.stash as unknown[]) if (!validItem(it)) return false;
  d.settings = { ...DEFAULT_SETTINGS, ...((d.settings as object) ?? {}) };
  d.won = typeof d.won === 'number' ? d.won : 0;
  d.fought = typeof d.fought === 'number' ? d.fought : 0;
  if (typeof d.seq !== 'number' || !Number.isFinite(d.seq)) delete d.seq;
  if (typeof d.savedAt !== 'number' || !Number.isFinite(d.savedAt)) delete d.savedAt;
  return true;
}

export function serialize(s: SaveData): string {
  return JSON.stringify(s);
}

export function deserialize(text: string | null | undefined): SaveData | null {
  if (!text) return null;
  try {
    return migrate(JSON.parse(text));
  } catch {
    return null;
  }
}

export const CHUNK_SIZE = 3800;

export function chunk(text: string, size = CHUNK_SIZE): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  if (out.length === 0) out.push('');
  return out;
}

export function unchunk(parts: (string | null | undefined)[]): string | null {
  if (parts.some((p) => p === null || p === undefined)) return null;
  return parts.join('');
}

/** Async key/value backend (Telegram CloudStorage or localStorage). */
export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const META = 'px_meta';
const PART = (i: number) => `px_part_${i}`;

export async function writeSave(kv: KV, s: SaveData): Promise<void> {
  const parts = chunk(serialize(s));
  const oldMeta = await kv.get(META);
  // Write parts first, then the meta record that points at them.
  for (let i = 0; i < parts.length; i++) await kv.set(PART(i), parts[i]);
  await kv.set(META, JSON.stringify({ v: s.v, n: parts.length }));
  if (oldMeta) {
    try {
      const old = JSON.parse(oldMeta) as { n: number };
      for (let i = parts.length; i < old.n; i++) await kv.remove(PART(i));
    } catch {
      /* ignore */
    }
  }
}

export async function readSave(kv: KV): Promise<SaveData | null> {
  const metaText = await kv.get(META);
  if (!metaText) return null;
  try {
    const meta = JSON.parse(metaText) as { n: number };
    const parts: (string | null)[] = [];
    for (let i = 0; i < meta.n; i++) parts.push(await kv.get(PART(i)));
    return deserialize(unchunk(parts));
  } catch {
    return null;
  }
}

export async function clearSave(kv: KV): Promise<void> {
  const metaText = await kv.get(META);
  if (metaText) {
    try {
      const meta = JSON.parse(metaText) as { n: number };
      for (let i = 0; i < meta.n; i++) await kv.remove(PART(i));
    } catch {
      /* ignore */
    }
  }
  await kv.remove(META);
}
